/**
 * Create / upvote / moderate / decide proposals for a whole new Article.
 *
 * Deliberately NOT a `"use server"` module — same reasoning as
 * `src/server/comments/core.ts`. Every function here takes the acting signer
 * id (and, where it matters, an `isAdmin` boolean) as a plain argument. Were
 * these exported from a `"use server"` file, a direct POST could propose in
 * anyone's name, upvote as anyone, or pass `callerIsAdmin: true` and accept
 * its own proposal.
 *
 * CALLERS MUST AUTHORISE. The wrappers in `src/server/actions/proposals.ts`
 * derive both from the Clerk session.
 */

import { and, eq } from "drizzle-orm";
import { proposedEdits, proposalUpvotes, NEW_ARTICLE_ANCHOR } from "@/lib/db/schema";
import {
  sanitizeProposalText,
  validateNewArticle,
  TITLE_MAX,
  BODY_MAX,
  RATIONALE_MAX,
  PULL_QUOTE_MAX,
} from "@/lib/proposals/validate";
import { PROPOSAL_LICENSE } from "@/lib/proposals/license";
import type { Db } from "@/lib/db/types";

export interface CreateNewArticleInput {
  baseVersionId: string;
  proposerSignerId: string;
  title: string;
  body: string;
  rationale: string;
  pullQuote?: string | null;
  /**
   * The licence id the submitting form displayed. Must equal
   * PROPOSAL_LICENSE.id — see that constant for why a mismatch is refused
   * rather than stamped.
   */
  license: string;
}

/**
 * The text as it was actually WRITTEN to the row — sanitised and truncated, not
 * as the caller supplied it.
 *
 * Returned so that anything mirroring a proposal elsewhere sends what the site
 * stores rather than re-deriving it from the raw form. The GitHub mirror used to
 * read `formData` a second time, which meant a mirrored issue could carry
 * control characters and untruncated text that appear nowhere on the site. The
 * fix is structural: there is now one place the stored text comes from, and it
 * is this.
 */
export interface StoredProposalText {
  title: string;
  body: string;
  rationale: string;
  pullQuote: string | null;
}

/**
 * Data-layer insert for a new-article proposal.
 *
 * Sanitises first, then validates the sanitised values — the other order lets
 * a submission pass the length check on characters that are then stripped.
 */
export async function createNewArticleProposal(
  db: Db,
  input: CreateNewArticleInput,
): Promise<
  | { ok: true; id: string; stored: StoredProposalText }
  | { ok: false; error: string; field?: string }
> {
  if (input.license !== PROPOSAL_LICENSE.id) {
    return {
      ok: false,
      error:
        "This page is out of date — reload it to see the licence your proposal is filed under, then submit again.",
    };
  }

  const title = sanitizeProposalText(input.title, TITLE_MAX);
  const body = sanitizeProposalText(input.body, BODY_MAX);
  const rationale = sanitizeProposalText(input.rationale, RATIONALE_MAX);
  const pullQuote = sanitizeProposalText(input.pullQuote ?? "", PULL_QUOTE_MAX) || null;

  const check = validateNewArticle({ title, body, rationale, pullQuote });
  if (!check.ok) {
    const [field, message] = Object.entries(check.errors)[0] as [string, string];
    return { ok: false, error: message, field };
  }

  const [row] = await db
    .insert(proposedEdits)
    .values({
      baseVersionId: input.baseVersionId,
      proposerSignerId: input.proposerSignerId,
      kind: "new_article",
      targetAnchorId: NEW_ARTICLE_ANCHOR,
      title,
      newText: body,
      rationale,
      pullQuote,
      license: PROPOSAL_LICENSE.id,
      licenseGrantedAt: new Date(),
    })
    .returning({ id: proposedEdits.id });

  // The proposer's own endorsement. Without it a brand-new proposal shows "0
  // supporters" next to a person who obviously supports it, and the queue's
  // sort treats "nobody has seen this yet" and "seen and rejected" alike.
  // onConflictDoNothing so a retry of a partially-failed submit is harmless.
  await db
    .insert(proposalUpvotes)
    .values({ proposalId: row.id, signerId: input.proposerSignerId })
    .onConflictDoNothing();

  return { ok: true, id: row.id, stored: { title, body, rationale, pullQuote } };
}

/**
 * Toggle one signer's endorsement of a proposal. Idempotent per (proposal,
 * signer) by the unique index; this is the read-then-write form used by
 * `toggleCommentUpvote`, kept the same so the two behave identically.
 */
export async function toggleProposalUpvote(
  db: Db,
  input: { proposalId: string; signerId: string },
): Promise<{ state: "upvoted" | "removed" }> {
  const existing = await db
    .select()
    .from(proposalUpvotes)
    .where(
      and(
        eq(proposalUpvotes.proposalId, input.proposalId),
        eq(proposalUpvotes.signerId, input.signerId),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    await db
      .delete(proposalUpvotes)
      .where(
        and(
          eq(proposalUpvotes.proposalId, input.proposalId),
          eq(proposalUpvotes.signerId, input.signerId),
        ),
      );
    return { state: "removed" };
  }

  await db
    .insert(proposalUpvotes)
    .values({ proposalId: input.proposalId, signerId: input.signerId })
    .onConflictDoNothing();
  return { state: "upvoted" };
}

/**
 * Withdraw your own proposal, or hide someone else's as an admin.
 *
 * Soft only. `comments.proposal_id` is a FK onto this row and the upvotes are
 * other people's, so a DELETE would either fail or take their work with it.
 */
export async function hideProposal(
  db: Db,
  proposalId: string,
  callerSignerId: string,
  callerIsAdmin: boolean,
  reason?: string,
): Promise<{ ok: boolean; error?: string }> {
  const rows = await db
    .select({ id: proposedEdits.id, proposerSignerId: proposedEdits.proposerSignerId })
    .from(proposedEdits)
    .where(eq(proposedEdits.id, proposalId))
    .limit(1);
  if (rows.length === 0) return { ok: false, error: "Proposal not found." };

  const isOwner = rows[0].proposerSignerId === callerSignerId;
  if (!isOwner && !callerIsAdmin) return { ok: false, error: "Not authorized." };

  await db
    .update(proposedEdits)
    .set({
      hiddenAt: new Date(),
      hiddenReason: reason ?? (isOwner ? "author_withdrew" : "admin_hidden"),
    })
    .where(eq(proposedEdits.id, proposalId));
  return { ok: true };
}

export async function unhideProposal(
  db: Db,
  proposalId: string,
  callerIsAdmin: boolean,
): Promise<{ ok: boolean; error?: string }> {
  if (!callerIsAdmin) return { ok: false, error: "Not authorized." };
  await db
    .update(proposedEdits)
    .set({ hiddenAt: null, hiddenReason: null })
    .where(eq(proposedEdits.id, proposalId));
  return { ok: true };
}

/**
 * Admin decision. `accepted` means "this goes into the next version"; the
 * actual splice into `content/bill-of-rights/<next>.md` is a separate,
 * deliberate editorial act, and the row moves to `published` only when
 * `publishedInVersionId` is set at that point. Keeping those two steps apart
 * is the reason the status enum has both values.
 */
export async function decideProposal(
  db: Db,
  proposalId: string,
  decision: "accepted" | "rejected",
  callerSignerId: string,
  callerIsAdmin: boolean,
): Promise<{ ok: boolean; error?: string }> {
  if (!callerIsAdmin) return { ok: false, error: "Not authorized." };
  const rows = await db
    .select({ status: proposedEdits.status })
    .from(proposedEdits)
    .where(eq(proposedEdits.id, proposalId))
    .limit(1);
  if (rows.length === 0) return { ok: false, error: "Proposal not found." };
  if (rows[0].status === "published") {
    return { ok: false, error: "Already published — decide on the version, not the proposal." };
  }

  await db
    .update(proposedEdits)
    .set({ status: decision, decidedAt: new Date(), decidedBy: callerSignerId })
    .where(eq(proposedEdits.id, proposalId));
  return { ok: true };
}

/**
 * Placeholder slot number for a proposal that has not been assigned one yet.
 *
 * Which slot a proposal takes is an editorial call made when the next version
 * is assembled, not when it is accepted, so the admin preview renders the
 * literal `N` that appears in the pasted block until an editor replaces it.
 */
export const ARTICLE_NUMBER_PLACEHOLDER = "N";

/**
 * Render an accepted proposal as canonical markdown, ready to paste into the
 * next version file. `number` is assigned by the editor at publish time, which
 * is why the proposer never supplies it; pass `ARTICLE_NUMBER_PLACEHOLDER` for
 * a preview of a proposal whose slot is still undecided.
 *
 * Sentence ids follow the `{#article-N-s-M}` convention in v0.1.0.md. The pull
 * quote is emitted as the final sentence, matching "every article now closes
 * with its pull quote" from the 0.1.0 changelog.
 *
 * THE ONLY renderer for this block. The admin preview on /admin/proposals used
 * to inline its own copy of the split-and-anchor logic below, which meant the
 * markdown an admin copied and the markdown published from an accepted
 * proposal could drift apart silently — same input, two implementations, no
 * test comparing them. Route every caller here.
 */
export function renderProposalAsMarkdown(
  proposal: { title: string | null; newText: string | null; pullQuote: string | null },
  number: number | string,
): string {
  const sentences = splitIntoSentences(proposal.newText ?? "");
  if (proposal.pullQuote) sentences.push(proposal.pullQuote);
  const body = sentences
    .map((s, i) => `${s} {#article-${number}-s-${i + 1}}`)
    .join(" ");
  return `## Article ${number}: ${proposal.title ?? ""} {#article-${number}}\n\n${body}\n`;
}

/**
 * Sentence split for the markdown renderer only.
 *
 * NOT shared with `splitSentences` in HomepageArticles: that one defines live
 * anchor ids for comments already written against them, and coupling a
 * publish-time helper to it would mean a change here could silently re-point
 * existing comments (see the header of src/app/anchor-map.ts). Output here is
 * reviewed by a human before it is committed, so an imperfect split is a typo
 * to fix in the editor, not a data hazard.
 */
function splitIntoSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z"'“‘])/)
    .map((s) => s.trim())
    .filter(Boolean);
}
