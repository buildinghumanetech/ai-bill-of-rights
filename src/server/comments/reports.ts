/**
 * Comment reports (flags). Deliberately NOT a `"use server"` module — see
 * `src/server/signers/delete.ts`. Both functions take the reporting
 * `signerId` as an argument, so exporting them from a `"use server"` file let
 * a direct POST manufacture flags in other signers' names — and flags feed
 * moderation, so that is a way to get someone else's comment hidden.
 *
 * CALLERS MUST AUTHORISE — see `src/server/actions/comment-reports.ts`.
 */

import { and, eq } from "drizzle-orm";
import { commentReports } from "@/lib/db/schema";

/** Pure data-layer insert. Idempotent via unique constraint. */
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

/**
 * Toggle report for a comment: insert if not present, delete if already present.
 * Returns the resulting flag state.
 */
export async function toggleReportComment(
  db: any,
  input: { signerId: string; commentId: string },
): Promise<{ state: "flagged" | "unflagged" }> {
  const existing = await db
    .select({ id: commentReports.id })
    .from(commentReports)
    .where(
      and(
        eq(commentReports.commentId, input.commentId),
        eq(commentReports.reporterSignerId, input.signerId),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    await db
      .delete(commentReports)
      .where(
        and(
          eq(commentReports.commentId, input.commentId),
          eq(commentReports.reporterSignerId, input.signerId),
        ),
      );
    return { state: "unflagged" };
  }

  await db.insert(commentReports).values({
    commentId: input.commentId,
    reporterSignerId: input.signerId,
  });
  return { state: "flagged" };
}
