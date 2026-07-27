/**
 * Comment upvotes. Deliberately NOT a `"use server"` module — see
 * `src/server/signers/delete.ts`. `toggleCommentUpvote` takes the upvoting
 * `signerId` as an argument, so exporting it from a `"use server"` file let a
 * direct POST upvote as anybody, including soft-banned accounts the wrapper
 * turns away.
 *
 * CALLERS MUST AUTHORISE — see `src/server/actions/upvotes.ts`.
 */

import { and, eq } from "drizzle-orm";
import { commentUpvotes } from "@/lib/db/schema";

export async function toggleCommentUpvote(
  db: any,
  input: { commentId: string; signerId: string },
): Promise<{ state: "upvoted" | "removed" }> {
  const existing = await db
    .select()
    .from(commentUpvotes)
    .where(
      and(
        eq(commentUpvotes.commentId, input.commentId),
        eq(commentUpvotes.signerId, input.signerId),
      ),
    )
    .limit(1);
  if (existing.length > 0) {
    await db
      .delete(commentUpvotes)
      .where(
        and(
          eq(commentUpvotes.commentId, input.commentId),
          eq(commentUpvotes.signerId, input.signerId),
        ),
      );
    return { state: "removed" };
  }
  await db
    .insert(commentUpvotes)
    .values({ commentId: input.commentId, signerId: input.signerId });
  return { state: "upvoted" };
}
