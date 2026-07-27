"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import { signers } from "@/lib/db/schema";
import { toggleCommentUpvote } from "@/server/comments/upvotes";
import { getDb } from "@/lib/db/lazy";

/**
 * The toggle itself lives in `@/server/comments/upvotes`, a plain module,
 * because everything exported from this file is a POST-reachable Server
 * Function and `toggleCommentUpvote` takes the upvoting signer id.
 */
export async function toggleCommentUpvoteAction(commentId: string): Promise<{ ok: boolean; error?: string; state?: "upvoted" | "removed" }> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "Not signed in." };
  const db = getDb();
  const me = await db
    .select({ id: signers.id, softBannedAt: signers.softBannedAt })
    .from(signers)
    .where(eq(signers.clerkUserId, userId))
    .limit(1);
  if (me.length === 0) return { ok: false, error: "Sign first to upvote." };
  if (me[0].softBannedAt) return { ok: false, error: "This account is suspended pending moderator review." };
  const result = await toggleCommentUpvote(db, { commentId, signerId: me[0].id });
  revalidatePath("/");
  return { ok: true, state: result.state };
}
