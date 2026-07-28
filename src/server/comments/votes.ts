/**
 * Comment up/down votes. Deliberately NOT a `"use server"` module — see
 * `src/server/signers/delete.ts`. `voteOnComment` takes the voting
 * `signerId` as an argument, so exporting it from a `"use server"` file let a
 * direct POST cast votes as anybody, bypassing the self-vote check and the
 * rate limit in the action wrapper.
 *
 * CALLERS MUST AUTHORISE — see `src/server/actions/comment-votes.ts`.
 */

import { and, eq } from "drizzle-orm";
import { commentVotes } from "@/lib/db/schema";

/** Pure data-layer toggle, exposed for the action wrapper and tests. */
export async function voteOnComment(
  db: any,
  input: { signerId: string; commentId: string; direction: 1 | -1 },
): Promise<{ state: "added" | "switched" | "removed" }> {
  const existing = await db
    .select()
    .from(commentVotes)
    .where(and(eq(commentVotes.commentId, input.commentId), eq(commentVotes.signerId, input.signerId)))
    .limit(1);
  if (existing.length === 0) {
    await db.insert(commentVotes).values({
      commentId: input.commentId,
      signerId: input.signerId,
      direction: input.direction,
    });
    return { state: "added" };
  }
  if (existing[0].direction === input.direction) {
    await db
      .delete(commentVotes)
      .where(and(eq(commentVotes.commentId, input.commentId), eq(commentVotes.signerId, input.signerId)));
    return { state: "removed" };
  }
  await db
    .update(commentVotes)
    .set({ direction: input.direction })
    .where(and(eq(commentVotes.commentId, input.commentId), eq(commentVotes.signerId, input.signerId)));
  return { state: "switched" };
}
