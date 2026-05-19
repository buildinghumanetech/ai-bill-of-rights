"use server";

import { eq, and, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { reports, comments, signers } from "@/lib/db/schema";

let _db: any | null = null;
function getDb() {
  if (!_db) _db = (require("@/lib/db") as { db: any }).db;
  return _db;
}

const AUTO_HIDE_THRESHOLD = 5;

export interface ReportCommentInput {
  commentId: string;
  reporterSignerId: string;
  reason: string | null;
}

export async function reportComment(
  dbClient: any = null,
  input: ReportCommentInput,
): Promise<void> {
  const db = dbClient ?? getDb();
  await db.insert(reports).values({
    commentId: input.commentId,
    reporterSignerId: input.reporterSignerId,
    reason: input.reason,
  });

  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(reports)
    .where(
      and(
        eq(reports.commentId, input.commentId),
        isNull(reports.resolvedAt),
      ),
    );
  const count = Number(rows[0]?.count ?? 0);
  if (count >= AUTO_HIDE_THRESHOLD) {
    const [existing] = await db
      .select({ hiddenAt: comments.hiddenAt })
      .from(comments)
      .where(eq(comments.id, input.commentId));
    if (existing && existing.hiddenAt === null) {
      await db
        .update(comments)
        .set({
          hiddenAt: new Date(),
          hiddenReason: "auto: threshold of reports",
        })
        .where(eq(comments.id, input.commentId));
    }
  }
}

export async function resolveReport(
  dbClient: any = null,
  reportId: string,
  resolverSignerId: string,
  resolution: "hidden" | "allowed",
): Promise<void> {
  const db = dbClient ?? getDb();
  await db
    .update(reports)
    .set({
      resolvedAt: new Date(),
      resolvedBy: resolverSignerId,
      resolution,
    })
    .where(eq(reports.id, reportId));
}

export async function submitReportAction(formData: FormData): Promise<void> {
  const { userId } = await auth();
  if (!userId) redirect("/");
  const commentId = String(formData.get("commentId") ?? "");
  const reason = (formData.get("reason")?.toString() ?? "") || null;
  const versionString = String(formData.get("versionString") ?? "");
  const db = getDb();
  const signerRows = await db
    .select({ id: signers.id, softBannedAt: signers.softBannedAt })
    .from(signers)
    .where(eq(signers.clerkUserId, userId))
    .limit(1);
  if (signerRows.length === 0) {
    throw new Error("Only verified signers can report");
  }
  if (signerRows[0].softBannedAt !== null) {
    throw new Error("This account is suspended pending moderator review.");
  }
  await reportComment(db, { commentId, reporterSignerId: signerRows[0].id, reason });
  revalidatePath(`/v/${versionString}`);
}
