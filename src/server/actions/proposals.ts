"use server";

import { and, eq, inArray, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import { proposedEdits, proposalUpvotes, signers } from "@/lib/db/schema";
import { enforceRateLimit } from "@/lib/ratelimit/enforce";
import { getCurrentAdmin } from "@/lib/admin/check";

let _db: any | null = null;
function getDb() {
  if (!_db) _db = (require("@/lib/db") as { db: any }).db;
  return _db;
}

// ──────────────────────────────────────────────────────────────────────────────
// Data-layer functions (pure, testable)
// ──────────────────────────────────────────────────────────────────────────────

export interface CreateProposalInput {
  baseVersionId: string;
  proposerSignerId: string;
  kind: "replace" | "insert_after" | "delete";
  targetAnchorId: string;
  newText?: string;
  rationale?: string;
}

/**
 * Pure data-layer insert. Validates that non-delete proposals have newText.
 */
export async function createProposal(
  db: any,
  input: CreateProposalInput,
): Promise<{ id: string }> {
  if (input.kind !== "delete" && !input.newText?.trim()) {
    throw new Error("newText is required for replace and insert_after proposals.");
  }
  const [row] = await db
    .insert(proposedEdits)
    .values({
      baseVersionId: input.baseVersionId,
      proposerSignerId: input.proposerSignerId,
      kind: input.kind,
      targetAnchorId: input.targetAnchorId,
      newText: input.newText?.trim() ?? null,
      rationale: input.rationale?.trim() ?? null,
      status: "pending",
    })
    .returning({ id: proposedEdits.id });
  return { id: row.id };
}

/**
 * Accepts a proposal and auto-rejects conflicting pending proposals:
 * - Accepting a `replace` → auto-reject all OTHER pending replaces on same anchor.
 * - Accepting a `delete`  → auto-reject pending insert_afters on same anchor.
 */
export async function acceptProposal(
  db: any,
  input: { proposalId: string; deciderSignerId: string },
): Promise<void> {
  const rows = await db
    .select()
    .from(proposedEdits)
    .where(eq(proposedEdits.id, input.proposalId))
    .limit(1);
  if (rows.length === 0) throw new Error("Proposal not found.");
  const proposal = rows[0];

  // Mark accepted
  await db
    .update(proposedEdits)
    .set({
      status: "accepted",
      decidedAt: new Date(),
      decidedBy: input.deciderSignerId,
    })
    .where(eq(proposedEdits.id, input.proposalId));

  // Auto-reject conflicts
  if (proposal.kind === "replace") {
    // Reject all other pending replaces for the same anchor
    await db
      .update(proposedEdits)
      .set({ status: "rejected", decidedAt: new Date(), decidedBy: input.deciderSignerId })
      .where(
        and(
          eq(proposedEdits.baseVersionId, proposal.baseVersionId),
          eq(proposedEdits.targetAnchorId, proposal.targetAnchorId),
          eq(proposedEdits.kind, "replace"),
          eq(proposedEdits.status, "pending"),
          ne(proposedEdits.id, input.proposalId),
        ),
      );
  } else if (proposal.kind === "delete") {
    // Reject pending insert_afters for the same anchor
    await db
      .update(proposedEdits)
      .set({ status: "rejected", decidedAt: new Date(), decidedBy: input.deciderSignerId })
      .where(
        and(
          eq(proposedEdits.baseVersionId, proposal.baseVersionId),
          eq(proposedEdits.targetAnchorId, proposal.targetAnchorId),
          eq(proposedEdits.kind, "insert_after"),
          eq(proposedEdits.status, "pending"),
        ),
      );
  }
}

export async function rejectProposal(
  db: any,
  input: { proposalId: string; deciderSignerId: string },
): Promise<void> {
  await db
    .update(proposedEdits)
    .set({
      status: "rejected",
      decidedAt: new Date(),
      decidedBy: input.deciderSignerId,
    })
    .where(eq(proposedEdits.id, input.proposalId));
}

// ──────────────────────────────────────────────────────────────────────────────
// Server action wrappers
// ──────────────────────────────────────────────────────────────────────────────

export async function submitProposalAction(
  formData: FormData,
): Promise<{ ok: boolean; error?: string; id?: string }> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "Not signed in." };

  const db = getDb();
  const me = await db
    .select({ id: signers.id, softBannedAt: signers.softBannedAt })
    .from(signers)
    .where(eq(signers.clerkUserId, userId))
    .limit(1);
  if (me.length === 0) return { ok: false, error: "Sign first to propose changes." };
  if (me[0].softBannedAt) {
    return { ok: false, error: "This account is suspended pending moderator review." };
  }

  const kind = String(formData.get("kind") ?? "") as "replace" | "insert_after" | "delete";
  if (!["replace", "insert_after", "delete"].includes(kind)) {
    return { ok: false, error: "Invalid proposal kind." };
  }

  const baseVersionId = String(formData.get("baseVersionId") ?? "");
  const targetAnchorId = String(formData.get("targetAnchorId") ?? "");
  const newText = formData.get("newText")?.toString() || undefined;
  const rationale = formData.get("rationale")?.toString() || undefined;

  try {
    await enforceRateLimit(db, {
      bucket: "proposal",
      signerId: me[0].id,
      windowSec: 3600,
      max: 10,
      countSql: `SELECT count(*)::int as n FROM proposed_edits WHERE proposer_signer_id = $1 AND created_at > now() - interval '1 hour'`,
    });
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  try {
    const result = await createProposal(db, {
      baseVersionId,
      proposerSignerId: me[0].id,
      kind,
      targetAnchorId,
      newText,
      rationale,
    });
    revalidatePath("/proposed");
    return { ok: true, id: result.id };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function acceptProposalAction(
  proposalId: string,
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getCurrentAdmin();
  if (ctx.state !== "admin") return { ok: false, error: "Forbidden." };

  try {
    await acceptProposal(getDb(), { proposalId, deciderSignerId: ctx.signer.id });
    revalidatePath("/proposed");
    revalidatePath("/admin/proposals");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function rejectProposalAction(
  proposalId: string,
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getCurrentAdmin();
  if (ctx.state !== "admin") return { ok: false, error: "Forbidden." };

  try {
    await rejectProposal(getDb(), { proposalId, deciderSignerId: ctx.signer.id });
    revalidatePath("/proposed");
    revalidatePath("/admin/proposals");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function toggleProposalUpvoteAction(
  proposalId: string,
): Promise<{ ok: boolean; error?: string; state?: "upvoted" | "removed" }> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "Not signed in." };

  const db = getDb();
  const me = await db
    .select({ id: signers.id, softBannedAt: signers.softBannedAt })
    .from(signers)
    .where(eq(signers.clerkUserId, userId))
    .limit(1);
  if (me.length === 0) return { ok: false, error: "Sign first to upvote." };
  if (me[0].softBannedAt) {
    return { ok: false, error: "This account is suspended pending moderator review." };
  }

  const existing = await db
    .select()
    .from(proposalUpvotes)
    .where(
      and(
        eq(proposalUpvotes.proposalId, proposalId),
        eq(proposalUpvotes.signerId, me[0].id),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    await db
      .delete(proposalUpvotes)
      .where(
        and(
          eq(proposalUpvotes.proposalId, proposalId),
          eq(proposalUpvotes.signerId, me[0].id),
        ),
      );
    revalidatePath("/proposed");
    return { ok: true, state: "removed" };
  }

  await db
    .insert(proposalUpvotes)
    .values({ proposalId, signerId: me[0].id });
  revalidatePath("/proposed");
  return { ok: true, state: "upvoted" };
}
