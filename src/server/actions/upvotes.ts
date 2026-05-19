"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { commentUpvotes, signers } from "@/lib/db/schema";

let _db: any | null = null;
function getDb() {
  if (!_db) _db = (require("@/lib/db") as { db: any }).db;
  return _db;
}

export async function toggleUpvote(
  dbClient: any = null,
  commentId: string,
  signerId: string,
): Promise<{ upvoted: boolean }> {
  const db = dbClient ?? getDb();
  const existing = await db
    .select()
    .from(commentUpvotes)
    .where(
      and(
        eq(commentUpvotes.commentId, commentId),
        eq(commentUpvotes.signerId, signerId),
      ),
    )
    .limit(1);
  if (existing.length > 0) {
    await db
      .delete(commentUpvotes)
      .where(
        and(
          eq(commentUpvotes.commentId, commentId),
          eq(commentUpvotes.signerId, signerId),
        ),
      );
    return { upvoted: false };
  }
  await db.insert(commentUpvotes).values({ commentId, signerId });
  return { upvoted: true };
}

export async function submitUpvoteAction(formData: FormData): Promise<void> {
  const { userId } = await auth();
  if (!userId) redirect("/");
  const commentId = String(formData.get("commentId") ?? "");
  const versionString = String(formData.get("versionString") ?? "");
  const db = getDb();
  const signerRows = await db
    .select({ id: signers.id })
    .from(signers)
    .where(eq(signers.clerkUserId, userId))
    .limit(1);
  if (signerRows.length === 0) {
    throw new Error("Only verified signers can upvote");
  }
  await toggleUpvote(db, commentId, signerRows[0].id);
  revalidatePath(`/v/${versionString}`);
}
