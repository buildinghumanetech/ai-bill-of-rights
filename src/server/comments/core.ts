/**
 * Comment create / edit / soft-delete. Deliberately NOT a `"use server"`
 * module — see `src/server/signers/delete.ts` for the reasoning.
 *
 * `createComment` takes the `signerId` to attribute the comment to, and
 * `deleteComment` / `editComment` take `callerSignerId` and `callerIsAdmin` as
 * plain arguments. Exported from a `"use server"` file, a direct POST could
 * post in anyone's name, or pass `callerIsAdmin: true` and edit or delete
 * every comment on the site.
 *
 * CALLERS MUST AUTHORISE. The wrappers in `src/server/actions/comments.ts`
 * derive both the signer id and the admin flag from the Clerk session.
 */

import { eq } from "drizzle-orm";
import { comments } from "@/lib/db/schema";

/**
 * Strip control characters and trim, then cap length.
 * Used for both comment body and selectedText.
 */
export function sanitizeText(raw: string, maxLen: number): string {
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
 * The action wrapper does auth + rate-limit + soft-ban checks.
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

/**
 * Data-layer delete. Used by deleteCommentAction and tests.
 * Caller is responsible for establishing who `callerSignerId` is and whether
 * they are really an admin.
 */
export async function deleteComment(
  db: any,
  commentId: string,
  callerSignerId: string,
  callerIsAdmin: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const comment = await db
    .select({ id: comments.id, signerId: comments.signerId })
    .from(comments)
    .where(eq(comments.id, commentId))
    .limit(1);
  if (comment.length === 0) return { ok: false, error: "Comment not found." };

  const isOwner = comment[0].signerId === callerSignerId;
  if (!isOwner && !callerIsAdmin) return { ok: false, error: "Not authorized." };

  const hiddenReason = callerIsAdmin && !isOwner ? "admin_delete" : "user_delete";

  await db
    .update(comments)
    .set({ hiddenAt: new Date(), hiddenReason })
    .where(eq(comments.id, commentId));
  return { ok: true };
}

/**
 * Data-layer edit. Used by editCommentAction and tests.
 * Caller is responsible for establishing who `callerSignerId` is and whether
 * they are really an admin.
 */
export async function editComment(
  db: any,
  commentId: string,
  newBody: string,
  callerSignerId: string,
  callerIsAdmin: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const comment = await db
    .select({ id: comments.id, signerId: comments.signerId })
    .from(comments)
    .where(eq(comments.id, commentId))
    .limit(1);
  if (comment.length === 0) return { ok: false, error: "Comment not found." };

  const isOwner = comment[0].signerId === callerSignerId;
  if (!isOwner && !callerIsAdmin) return { ok: false, error: "Not authorized." };

  const body = sanitizeText(newBody, 5000);
  if (!body) return { ok: false, error: "Comment body cannot be empty." };

  await db
    .update(comments)
    .set({ body })
    .where(eq(comments.id, commentId));
  return { ok: true };
}
