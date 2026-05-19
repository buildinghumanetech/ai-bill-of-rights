"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { comments, signers } from "@/lib/db/schema";
import { enforceRateLimit } from "@/lib/ratelimit/enforce";

let _db: any | null = null;
function getDb() {
  if (!_db) _db = (require("@/lib/db") as { db: any }).db;
  return _db;
}

export interface CreateCommentInput {
  versionId: string;
  anchorId: string;
  signerId: string;
  body: string;
  parentCommentId: string | null;
}

export async function createComment(
  dbClient: any = null,
  input: CreateCommentInput,
): Promise<{ id: string }> {
  const db = dbClient ?? getDb();
  const trimmed = input.body.trim();
  if (trimmed.length === 0) {
    throw new Error("Comment body cannot be empty");
  }
  if (trimmed.length > 5000) {
    throw new Error("Comment body cannot exceed 5000 characters");
  }
  const [row] = await db
    .insert(comments)
    .values({
      versionId: input.versionId,
      anchorId: input.anchorId,
      signerId: input.signerId,
      body: trimmed,
      parentCommentId: input.parentCommentId,
    })
    .returning({ id: comments.id });
  return { id: row.id };
}

export async function hideComment(
  dbClient: any = null,
  commentId: string,
  reason: string,
): Promise<void> {
  const db = dbClient ?? getDb();
  await db
    .update(comments)
    .set({ hiddenAt: new Date(), hiddenReason: reason })
    .where(eq(comments.id, commentId));
}

export async function unhideComment(
  dbClient: any = null,
  commentId: string,
): Promise<void> {
  const db = dbClient ?? getDb();
  await db
    .update(comments)
    .set({ hiddenAt: null, hiddenReason: null })
    .where(eq(comments.id, commentId));
}

export async function submitCommentAction(formData: FormData): Promise<void> {
  const { userId } = await auth();
  if (!userId) redirect("/");
  const versionId = String(formData.get("versionId") ?? "");
  const anchorId = String(formData.get("anchorId") ?? "");
  const body = String(formData.get("body") ?? "");
  const parentCommentId =
    (formData.get("parentCommentId")?.toString() ?? "") || null;
  const versionString = String(formData.get("versionString") ?? "");

  const db = getDb();
  const signerRows = await db
    .select({ id: signers.id })
    .from(signers)
    .where(eq(signers.clerkUserId, userId))
    .limit(1);
  if (signerRows.length === 0) {
    throw new Error("Only verified signers can comment");
  }
  const signerId = signerRows[0].id;

  await enforceRateLimit(db, {
    table: comments,
    timestampColumn: comments.createdAt,
    whereSignerColumn: comments.signerId,
    signerId,
    windowSeconds: 60,
    limit: 5,
    errorMessage: "You are commenting too quickly. Try again in a minute.",
  });
  await enforceRateLimit(db, {
    table: comments,
    timestampColumn: comments.createdAt,
    whereSignerColumn: comments.signerId,
    signerId,
    windowSeconds: 24 * 60 * 60,
    limit: 50,
    errorMessage: "You have reached the daily comment limit.",
  });

  await createComment(db, {
    versionId,
    anchorId,
    signerId,
    body,
    parentCommentId,
  });

  revalidatePath(`/v/${versionString}`);
}
