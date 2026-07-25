/**
 * The words that ride along with every share link.
 *
 * Default (no statement) is the boilerplate the site has always used. When a
 * signer has written a "why I signed" statement we lead with THEIR sentence
 * instead — a recipient reading a real human's words is reading a person, not
 * a petition, and people share their own words far more readily than a form
 * letter.
 *
 * Pair this with `signerShareUrl()` from ./urls — text and URL are built
 * separately so each channel can compose them the way it needs to.
 */

import { normalizeWhyISigned } from "@/lib/why-i-signed";
import type { ShareChannel } from "./urls";

/** The pre-existing share line. Still the fallback when there's no statement. */
export const GENERIC_SHARE_TEXT =
  "I just signed the AI Bill of Rights — nine commitments we're demanding from every AI company. Add your name too:";

/** Follows the quote everywhere except X. */
const LONG_TAIL =
  "That's why I signed the AI Bill of Rights — nine commitments we're demanding from every AI company. Add your name too:";

/** Follows the quote on X, where every character is rationed. */
const COMPACT_TAIL = "— why I signed the AI Bill of Rights. Add your name too:";

/**
 * X counts any link as 23 characters no matter how long it really is, and caps
 * a post at 280. Budget = 280 − 23 − the space separating text from URL.
 */
const X_TEXT_BUDGET = 280 - 23 - 1;

/** Curly quotes, because this is prose a human wrote, not a code string. */
const OPEN_QUOTE = "“";
const CLOSE_QUOTE = "”";

/**
 * Shorten to at most `max` characters, breaking at a word boundary and ending
 * with an ellipsis. Returns the input untouched when it already fits.
 */
function truncateAtWord(text: string, max: number): string {
  if (text.length <= max) return text;
  if (max <= 1) return "…";
  const head = text.slice(0, max - 1);
  const lastSpace = head.lastIndexOf(" ");
  // Only honour the word boundary if it doesn't gut the sentence.
  const body = lastSpace > max * 0.6 ? head.slice(0, lastSpace) : head;
  return `${body.replace(/[\s,;:.–—-]+$/, "")}…`;
}

export interface ShareTextOptions {
  /** The signer's statement, or null/empty if they never wrote one. */
  whyISigned?: string | null;
  /** Which surface the copy is for. X gets the character-rationed variant. */
  channel?: ShareChannel | null;
}

/**
 * The share copy for a signer on a given channel.
 *
 * With a statement: `“their sentence” <tail>`.
 * Without: the generic boilerplate, unchanged.
 *
 * Never exceeds X's budget when `channel === "x"`, truncating the quote at a
 * word boundary rather than letting the post get rejected.
 */
export function buildShareText(opts: ShareTextOptions = {}): string {
  const statement = normalizeWhyISigned(opts.whyISigned);
  if (!statement) return GENERIC_SHARE_TEXT;

  if (opts.channel === "x") {
    // 2 quote characters + the space before the tail.
    const overhead = 2 + 1 + COMPACT_TAIL.length;
    const quote = truncateAtWord(statement, X_TEXT_BUDGET - overhead);
    return `${OPEN_QUOTE}${quote}${CLOSE_QUOTE} ${COMPACT_TAIL}`;
  }

  return `${OPEN_QUOTE}${statement}${CLOSE_QUOTE} ${LONG_TAIL}`;
}

/** True when `buildShareText` would use the signer's own words. */
export function hasShareStatement(whyISigned?: string | null): boolean {
  return normalizeWhyISigned(whyISigned) !== null;
}
