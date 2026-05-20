"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import { comments, signers } from "@/lib/db/schema";
import { enforceRateLimit } from "@/lib/ratelimit/enforce";
import { getCurrentAdmin } from "@/lib/admin/check";

let _db: any | null = null;
function getDb() {
  if (!_db) _db = (require("@/lib/db") as { db: any }).db;
  return _db;
}

/**
 * Strip control characters and trim, then cap length.
 * Used for both comment body and selectedText.
 */
function sanitizeText(raw: string, maxLen: number): string {
  return raw.replace(/[\x00-\x08\x0B-\x1F\x7F]/g, "").trim().slice(0, maxLen);
}

export interface CreateCommentInput {
  baseVersionId: string;
  signerId: string;
  anchorId?: string;
  proposalId?: string;
  parentCommentId?: string;
  body: string;
  selectedText?: string | null;
}

/**
 * Data-layer insert. Trims the body, validates that exactly one of
 * (anchorId, proposalId) is set, and rejects empties.
 *
 * The action wrapper below does auth + rate-limit + soft-ban checks.
 */
export async function createComment(
  db: any,
  input: CreateCommentInput,
): Promise<{ id: string }> {
  const body = input.body.trim();
  if (!body) throw new Error("Comment body cannot be empty.");
  const hasAnchor = Boolean(input.anchorId);
  const hasProposal = Boolean(input.proposalId);
  if (hasAnchor === hasProposal) {
    throw new Error("Comment must target exactly one of anchorId or proposalId.");
  }
  const [row] = await db
    .insert(comments)
    .values({
      baseVersionId: input.baseVersionId,
      signerId: input.signerId,
      anchorId: input.anchorId ?? null,
      proposalId: input.proposalId ?? null,
      parentCommentId: input.parentCommentId ?? null,
      body,
      selectedText: input.selectedText ?? null,
    })
    .returning({ id: comments.id });
  return { id: row.id };
}

export async function submitCommentAction(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "Not signed in." };
  const db = getDb();
  const me = await db
    .select({ id: signers.id, softBannedAt: signers.softBannedAt })
    .from(signers)
    .where(eq(signers.clerkUserId, userId))
    .limit(1);
  if (me.length === 0) return { ok: false, error: "Sign first to comment." };
  if (me[0].softBannedAt) {
    return { ok: false, error: "This account is suspended pending moderator review." };
  }

  const baseVersionId = String(formData.get("baseVersionId") ?? "");
  const anchorId = formData.get("anchorId")?.toString() || undefined;
  const proposalId = formData.get("proposalId")?.toString() || undefined;
  const parentCommentId = formData.get("parentCommentId")?.toString() || undefined;
  const rawBody = String(formData.get("body") ?? "");
  const body = sanitizeText(rawBody, 5000);
  const rawSelectedText = formData.get("selectedText")?.toString() ?? "";
  const selectedText = rawSelectedText ? sanitizeText(rawSelectedText, 1000) : null;

  try {
    await enforceRateLimit(db, {
      bucket: "comment",
      signerId: me[0].id,
      windowSec: 3600,
      max: 20,
      countSql: `SELECT count(*)::int as n FROM comments WHERE signer_id = $1 AND created_at > now() - interval '1 hour'`,
    });
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  try {
    await createComment(db, {
      baseVersionId,
      signerId: me[0].id,
      anchorId,
      proposalId,
      parentCommentId,
      body,
      selectedText,
    });
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  revalidatePath("/");
  return { ok: true };
}

export async function hideCommentAction(
  commentId: string,
  reason: string = "Admin hidden",
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getCurrentAdmin();
  if (ctx.state !== "admin") return { ok: false, error: "Forbidden." };
  await getDb()
    .update(comments)
    .set({ hiddenAt: new Date(), hiddenReason: reason })
    .where(eq(comments.id, commentId));
  revalidatePath("/");
  revalidatePath("/admin/comments");
  return { ok: true };
}

export async function unhideCommentAction(commentId: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getCurrentAdmin();
  if (ctx.state !== "admin") return { ok: false, error: "Forbidden." };
  await getDb()
    .update(comments)
    .set({ hiddenAt: null, hiddenReason: null })
    .where(eq(comments.id, commentId));
  revalidatePath("/");
  revalidatePath("/admin/comments");
  return { ok: true };
}
