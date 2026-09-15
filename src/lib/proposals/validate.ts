/**
 * Limits and shape checks for a "propose a new right" submission.
 *
 * Imported by BOTH the client form and the server action on purpose: a single
 * definition means the inline counter under the textarea and the rejection the
 * server would issue can never disagree. The client copy is a convenience, not
 * a control — `validateNewArticle` is re-run server-side in every case.
 */

export const TITLE_MAX = 90;
export const BODY_MAX = 1200;
export const RATIONALE_MAX = 1200;
export const PULL_QUOTE_MAX = 160;

/** Below this the submission is a slogan, not a right. */
export const BODY_MIN = 80;
export const RATIONALE_MIN = 40;

export interface NewArticleInput {
  title: string;
  body: string;
  rationale: string;
  pullQuote?: string | null;
}

export interface ValidationResult {
  ok: boolean;
  /** Field-keyed messages, so the form can render each one in place. */
  errors: Partial<Record<keyof NewArticleInput, string>>;
}

/**
 * Strip control characters, collapse runs of blank lines, trim, cap length.
 * Mirrors `sanitizeText` in @/server/comments/core, with the paragraph
 * collapse added: an article body is multi-sentence prose, and a submission
 * padded with fifty newlines should not be able to stretch the queue card.
 */
export function sanitizeProposalText(raw: string, maxLen: number): string {
  return raw
    .replace(/[\x00-\x08\x0B-\x1F\x7F]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maxLen);
}

export function validateNewArticle(input: NewArticleInput): ValidationResult {
  const errors: ValidationResult["errors"] = {};
  const title = input.title.trim();
  const body = input.body.trim();
  const rationale = input.rationale.trim();
  const pullQuote = (input.pullQuote ?? "").trim();

  if (!title) {
    errors.title = "Give the right a name.";
  } else if (title.length > TITLE_MAX) {
    errors.title = `Keep the name under ${TITLE_MAX} characters.`;
  } else if (/^article\s*\d+\s*[:.\-]/i.test(title)) {
    // Numbering is assigned at publish time. A proposer who picks "Article 12"
    // is claiming a slot that may be taken by the time this is accepted, and
    // the number would then have to be edited out of live upvoted text.
    errors.title = "Leave the number off — it's assigned when the right is published.";
  }

  if (body.length < BODY_MIN) {
    errors.body = `The right itself needs at least ${BODY_MIN} characters — say what companies must and must not do.`;
  } else if (body.length > BODY_MAX) {
    errors.body = `Keep the right under ${BODY_MAX} characters.`;
  }

  if (rationale.length < RATIONALE_MIN) {
    errors.rationale = `Say in at least ${RATIONALE_MIN} characters why the existing eleven don't already cover this.`;
  } else if (rationale.length > RATIONALE_MAX) {
    errors.rationale = `Keep the rationale under ${RATIONALE_MAX} characters.`;
  }

  if (pullQuote.length > PULL_QUOTE_MAX) {
    errors.pullQuote = `Keep the closing line under ${PULL_QUOTE_MAX} characters.`;
  }

  return { ok: Object.keys(errors).length === 0, errors };
}
