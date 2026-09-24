"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import { signatures, signers } from "@/lib/db/schema";
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
 * Two different refusals, kept apart on purpose. No session says nothing about
 * whether someone has signed, so it must never be answered with "sign the Bill
 * of Rights". The form matches on these codes, not the message text, to offer
 * a sign-in button for one and a sign button for the other.
 */
type GateCode = "not_signed_in" | "not_signer";

type Gate = { ok: true; me: Me } | { ok: false; error: string; code?: GateCode };

const NOT_SIGNER_ERROR =
  "Only people who have signed the AI Bill of Rights can file or endorse proposals.";

/**
 * Signed in, with an account row, not suspended. Enough for acting on your own
 * proposal (withdraw) and for admin moderation — core checks ownership and
 * `isAdmin` itself. NOT enough to file or endorse: see requireSigner.
 */
async function requireAccount(): Promise<Gate> {
  const { userId } = await auth();
  if (!userId) {
    return {
      ok: false,
      code: "not_signed_in",
      error: "You're not signed in. Sign in, then file it — your text is still here.",
    };
  }
  const db = getDb();
  const rows = await db
    .select({ id: signers.id, softBannedAt: signers.softBannedAt, isAdmin: signers.isAdmin })
    .from(signers)
    .where(eq(signers.clerkUserId, userId))
    .limit(1);
  // The lookup is by Clerk user id only — `signers` stores no email or phone.
  if (rows.length === 0) {
    return { ok: false, code: "not_signer", error: NOT_SIGNER_ERROR };
  }
  if (rows[0].softBannedAt) {
    return { ok: false, error: "This account is suspended pending moderator review." };
  }
  return { ok: true, me: { id: rows[0].id, isAdmin: Boolean(rows[0].isAdmin) } };
}

/**
 * Someone who has actually SIGNED — at least one signature row, any version.
 *
 * A `signers` row alone is only an account: "create an account to comment"
 * makes one without signing. Checking just the row let an account that had
 * never signed file a proposal and endorse others, while /propose promises
 * endorsements come from "the same verified people who signed the document".
 * This runs inside every action that files or endorses, on the session's own
 * identity, so the client-side notice is UX and this is the control.
 */
async function requireSigner(): Promise<Gate> {
  const gate = await requireAccount();
  if (!gate.ok) return gate;
  const signed = await getDb()
    .select({ id: signatures.id })
    .from(signatures)
    .where(eq(signatures.signerId, gate.me.id))
    .limit(1);
  if (signed.length === 0) {
    return { ok: false, code: "not_signer", error: NOT_SIGNER_ERROR };
  }
  return gate;
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
): Promise<{ ok: boolean; error?: string; code?: string; state?: "upvoted" | "removed" }> {
  const gate = await requireSigner();
  if (!gate.ok) return { ok: false, error: gate.error, code: gate.code };
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
  const gate = await requireAccount();
  if (!gate.ok) return { ok: false, error: gate.error };
  const res = await hideProposal(getDb(), proposalId, gate.me.id, gate.me.isAdmin);
  revalidatePath("/propose");
  revalidatePath("/admin/proposals");
  return res;
}

export async function unhideProposalAction(
  proposalId: string,
): Promise<{ ok: boolean; error?: string }> {
  const gate = await requireAccount();
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
  const gate = await requireAccount();
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
