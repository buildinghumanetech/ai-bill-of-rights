"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import { signers } from "@/lib/db/schema";
import { getDb } from "@/lib/db/lazy";
import { getCurrentVersion } from "@/lib/db/queries";
import { enforceRateLimit, RateLimitError } from "@/lib/ratelimit/enforce";
import {
  createNewArticleProposal,
  decideProposal,
  hideProposal,
  toggleProposalUpvote,
  unhideProposal,
} from "@/server/proposals/core";
import { mirrorProposalToGitHub } from "@/lib/github/mirror-proposal";
import { LICENSE_FIELD } from "@/lib/proposals/license";

/**
 * Auth wrappers for the "propose a new right" flow. The writes themselves live
 * in `@/server/proposals/core`, a plain module — see its header for why.
 */

type Me = { id: string; isAdmin: boolean };

/**
 * Stable code for "signed in to Clerk, but no signer row". The form matches on
 * this, not on the message text, to turn the rejection into a way to sign.
 */
const NOT_SIGNER = "not_signer" as const;

async function requireSigner(): Promise<
  { ok: true; me: Me } | { ok: false; error: string; code?: typeof NOT_SIGNER }
> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "Not signed in." };
  const db = getDb();
  const rows = await db
    .select({ id: signers.id, softBannedAt: signers.softBannedAt, isAdmin: signers.isAdmin })
    .from(signers)
    .where(eq(signers.clerkUserId, userId))
    .limit(1);
  // Intended: proposals and endorsements come from verified signers (PR #82).
  // The lookup is by Clerk user id only — `signers` stores no email or phone —
  // so a Clerk account that never got a signer row reads as a non-signer here.
  if (rows.length === 0) {
    return {
      ok: false,
      code: NOT_SIGNER,
      error: "Only signers can file a proposal. Sign the Bill of Rights, then file it.",
    };
  }
  if (rows[0].softBannedAt) {
    return { ok: false, error: "This account is suspended pending moderator review." };
  }
  return { ok: true, me: { id: rows[0].id, isAdmin: Boolean(rows[0].isAdmin) } };
}

export async function submitNewRightAction(
  formData: FormData,
): Promise<{ ok: boolean; error?: string; code?: string; field?: string; id?: string }> {
  const gate = await requireSigner();
  if (!gate.ok) return { ok: false, error: gate.error, code: gate.code };
  const db = getDb();

  // The base version is resolved SERVER-SIDE from `is_current`, never read from
  // the form. A client-supplied version id would let a proposal be filed
  // against a superseded draft, where it would be invisible on /propose and
  // would never reach the queue — and the submitter would see a success.
  const current = await getCurrentVersion(db);
  if (!current) return { ok: false, error: "No current version — try again shortly." };

  // Three per hour. A proposal is a whole new article that people are asked to
  // read and endorse; the honest rate is much lower than the comment rate of
  // twenty, and the queue is the thing being protected.
  try {
    await enforceRateLimit(db, {
      bucket: "new_article_proposal",
      signerId: gate.me.id,
      windowSec: 3600,
      max: 3,
      countSql: `SELECT count(*)::int as n FROM proposed_edits WHERE proposer_signer_id = $1 AND kind = 'new_article' AND created_at > now() - interval '1 hour'`,
    });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return {
        ok: false,
        error: "That's three proposals in an hour — give the queue time to read them.",
      };
    }
    throw err;
  }

  const result = await createNewArticleProposal(db, {
    baseVersionId: current.id,
    proposerSignerId: gate.me.id,
    title: String(formData.get("title") ?? ""),
    body: String(formData.get("body") ?? ""),
    rationale: String(formData.get("rationale") ?? ""),
    pullQuote: formData.get("pullQuote")?.toString() ?? null,
    license: String(formData.get(LICENSE_FIELD) ?? ""),
  });
  if (!result.ok) return result;

  // Optional GitHub mirror. Detached and swallowed: the proposal is already
  // stored, and a GitHub outage must not surface as a failed submission to
  // someone who just wrote 1200 characters. See the module header.
  //
  // Mirrors `result.stored`, NOT `formData`. Reading the form a second time here
  // sent GitHub the raw submission while the database held the sanitised,
  // truncated version — so a public issue could carry control characters and
  // text past the length limits that appear nowhere on the site. Mirror what was
  // stored, so the two cannot disagree.
  void mirrorProposalToGitHub({
    proposalId: result.id,
    title: result.stored.title,
    body: result.stored.body,
    rationale: result.stored.rationale,
  }).catch((err) => console.error("[proposal] GitHub mirror failed:", err));

  revalidatePath("/propose");
  return { ok: true, id: result.id };
}

export async function toggleProposalUpvoteAction(
  proposalId: string,
): Promise<{ ok: boolean; error?: string; state?: "upvoted" | "removed" }> {
  const gate = await requireSigner();
  if (!gate.ok) return { ok: false, error: gate.error };
  const res = await toggleProposalUpvote(getDb(), {
    proposalId,
    signerId: gate.me.id,
  });
  revalidatePath("/propose");
  return { ok: true, state: res.state };
}

export async function withdrawProposalAction(
  proposalId: string,
): Promise<{ ok: boolean; error?: string }> {
  const gate = await requireSigner();
  if (!gate.ok) return { ok: false, error: gate.error };
  const res = await hideProposal(getDb(), proposalId, gate.me.id, gate.me.isAdmin);
  revalidatePath("/propose");
  revalidatePath("/admin/proposals");
  return res;
}

export async function unhideProposalAction(
  proposalId: string,
): Promise<{ ok: boolean; error?: string }> {
  const gate = await requireSigner();
  if (!gate.ok) return { ok: false, error: gate.error };
  const res = await unhideProposal(getDb(), proposalId, gate.me.isAdmin);
  revalidatePath("/propose");
  revalidatePath("/admin/proposals");
  return res;
}

export async function decideProposalAction(
  proposalId: string,
  decision: "accepted" | "rejected",
): Promise<{ ok: boolean; error?: string }> {
  const gate = await requireSigner();
  if (!gate.ok) return { ok: false, error: gate.error };
  const res = await decideProposal(
    getDb(),
    proposalId,
    decision,
    gate.me.id,
    gate.me.isAdmin,
  );
  revalidatePath("/propose");
  revalidatePath("/admin/proposals");
  return res;
}
