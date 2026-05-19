"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import { comments, signers } from "@/lib/db/schema";
import { enforceRateLimit } from "@/lib/ratelimit/enforce";

let _db: any | null = null;
function getDb() {
  if (!_db) _db = (require("@/lib/db") as { db: any }).db;
  return _db;
}

export interface CreateCommentInput {
  baseVersionId: string;
  signerId: string;
  anchorId?: string;
  proposalId?: string;
  parentCommentId?: string;
  body: string;
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
  const body = String(formData.get("body") ?? "");

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
    });
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  revalidatePath("/");
  return { ok: true };
}
