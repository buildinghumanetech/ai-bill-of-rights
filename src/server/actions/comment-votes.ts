"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import { comments, signers } from "@/lib/db/schema";
import { enforceRateLimit } from "@/lib/ratelimit/enforce";
import { voteOnComment } from "@/server/comments/votes";
import { getDb } from "@/lib/db/lazy";

/**
 * The toggle itself lives in `@/server/comments/votes`, a plain module,
 * because everything exported from this file is a POST-reachable Server
 * Function and `voteOnComment` takes the voting signer id as an argument.
 */
export async function voteCommentAction(
  commentId: string,
  direction: 1 | -1,
): Promise<{ ok: boolean; error?: string; state?: "added" | "switched" | "removed" }> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "Not signed in." };
  if (direction !== 1 && direction !== -1) return { ok: false, error: "Bad direction." };
  const db = getDb();
  const me = await db
    .select({ id: signers.id, softBannedAt: signers.softBannedAt })
    .from(signers)
    .where(eq(signers.clerkUserId, userId))
    .limit(1);
  if (me.length === 0) return { ok: false, error: "Sign first to vote." };
  if (me[0].softBannedAt) return { ok: false, error: "This account is suspended." };

  // Prevent self-voting
  const target = await db
    .select({ signerId: comments.signerId })
    .from(comments)
    .where(eq(comments.id, commentId))
    .limit(1);
  if (target.length === 0) return { ok: false, error: "Comment not found." };
  if (target[0].signerId === me[0].id) return { ok: false, error: "Can't vote on your own comment." };

  // Rate-limit: 60 votes per hour per signer
  try {
    await enforceRateLimit(db, {
      bucket: "comment_vote",
      signerId: me[0].id,
      windowSec: 3600,
      max: 60,
      countSql: `SELECT count(*)::int as n FROM comment_votes WHERE signer_id = $1 AND created_at > now() - interval '1 hour'`,
    });
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  const res = await voteOnComment(db, { signerId: me[0].id, commentId, direction });
  revalidatePath("/proposed");
  revalidatePath("/");
  return { ok: true, state: res.state };
}
