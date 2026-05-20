"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import { commentUpvotes, signers } from "@/lib/db/schema";

let _db: any | null = null;
function getDb() {
  if (!_db) _db = (require("@/lib/db") as { db: any }).db;
  return _db;
}

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
