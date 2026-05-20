"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import { commentReports, signers } from "@/lib/db/schema";

let _db: any | null = null;
function getDb() {
  if (!_db) _db = (require("@/lib/db") as { db: any }).db;
  return _db;
}

/** Pure data-layer insert, exposed for tests. Idempotent via unique constraint. */
export async function reportComment(
  db: any,
  input: { signerId: string; commentId: string },
): Promise<{ state: "reported" | "already_reported" }> {
  try {
    await db.insert(commentReports).values({
      commentId: input.commentId,
      reporterSignerId: input.signerId,
    });
    return { state: "reported" };
  } catch (err: any) {
    if (String(err?.message ?? "").includes("comment_reports_comment_reporter_unique")) {
      return { state: "already_reported" };
    }
    throw err;
  }
}

export async function reportCommentAction(commentId: string): Promise<{
  ok: boolean;
  error?: string;
  state?: "reported" | "already_reported";
}> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "Not signed in." };
  const db = getDb();
  const me = await db
    .select({ id: signers.id, softBannedAt: signers.softBannedAt })
    .from(signers)
    .where(eq(signers.clerkUserId, userId))
    .limit(1);
  if (me.length === 0) return { ok: false, error: "Sign first to flag." };
  if (me[0].softBannedAt) return { ok: false, error: "This account is suspended." };

  const res = await reportComment(db, { signerId: me[0].id, commentId });
  revalidatePath("/proposed");
  revalidatePath("/admin/comment-reports");
  return { ok: true, state: res.state };
}
