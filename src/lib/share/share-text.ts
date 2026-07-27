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
 *
 * Pure module: imported by SignModal ("use client"), so it must stay free of
 * drizzle / db / server imports. See the boundary note in @/lib/why-i-signed.
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

/** X's post limit, in weighted units. */
export const X_POST_LIMIT = 280;

/**
 * X counts any link as exactly this much, however long the URL really is —
 * t.co rewrites it, so the real length is irrelevant. `signerShareUrl()`
 * produces something like 90 characters; it still costs 23.
 */
export const X_URL_WEIGHT = 23;

/** Budget for the text itself: the limit, less the URL, less the space before it. */
const X_TEXT_BUDGET = X_POST_LIMIT - X_URL_WEIGHT - 1;

/** Curly quotes, because this is prose a human wrote, not a code string. */
const OPEN_QUOTE = "“";
const CLOSE_QUOTE = "”";

/**
 * X's weighted character count, from the ranges in its published counting
 * rules: code points in these four ranges cost 1, everything else costs 2.
 *
 * This is not pedantry — it is the difference between a share link that posts
 * and one X rejects. A statement in Chinese, Japanese, Korean, Arabic, Hindi,
 * Greek, Cyrillic above U+10FF, or containing a single emoji, costs 2 per
 * character, so a 200-character statement measured with `.length` can be 400
 * weighted units: a post that is 180 units over the limit while every `.length`
 * check in the file says it fits. Note U+2026 "…", the ellipsis truncation
 * appends, is NOT in the light ranges — it costs 2, and the budget below
 * accounts for it.
 */
function charWeight(codePoint: number): 1 | 2 {
  if (codePoint <= 0x10ff) return 1;
  if (codePoint >= 0x2000 && codePoint <= 0x200d) return 1;
  if (codePoint >= 0x2010 && codePoint <= 0x201f) return 1;
  if (codePoint >= 0x2032 && codePoint <= 0x2037) return 1;
  return 2;
}

/** Weighted length of `text` under X's counting rules. */
export function xWeightedLength(text: string): number {
  let total = 0;
  // for..of iterates code points, so a surrogate pair is counted once.
  for (const ch of text) total += charWeight(ch.codePointAt(0)!);
  return total;
}

/**
 * What the finished post costs X: the text, the separating space, and the
 * fixed URL weight. This is the number that must stay <= X_POST_LIMIT.
 */
export function xPostWeight(text: string): number {
  return xWeightedLength(text) + 1 + X_URL_WEIGHT;
}

/**
 * Shorten to at most `maxWeight` WEIGHTED units, breaking at a word boundary
 * and ending with an ellipsis. Returns the input untouched when it already
 * fits. Cuts on code-point boundaries, so a surrogate pair is never halved.
 */
function truncateToWeight(text: string, maxWeight: number): string {
  if (xWeightedLength(text) <= maxWeight) return text;
  const ellipsisWeight = xWeightedLength("…");
  if (maxWeight <= ellipsisWeight) return "…";

  const budget = maxWeight - ellipsisWeight;
  let used = 0;
  let cut = 0;
  for (const ch of text) {
    const w = charWeight(ch.codePointAt(0)!);
    if (used + w > budget) break;
    used += w;
    cut += ch.length;
  }

  const head = text.slice(0, cut);
  const lastSpace = head.lastIndexOf(" ");
  // Only honour the word boundary if it doesn't gut the sentence.
  const body = lastSpace > head.length * 0.6 ? head.slice(0, lastSpace) : head;
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
 * For `channel === "x"` the result is guaranteed to satisfy
 * `xPostWeight(result) <= X_POST_LIMIT` for ANY input — including a statement
 * made entirely of double-weight characters — truncating the quote at a word
 * boundary rather than letting the post get rejected.
 */
export function buildShareText(opts: ShareTextOptions = {}): string {
  const statement = normalizeWhyISigned(opts.whyISigned);
  if (!statement) return GENERIC_SHARE_TEXT;

  if (opts.channel === "x") {
    // The two quote marks, the space before the tail, and the tail itself —
    // all measured in weighted units, like the budget they are subtracted from.
    const overhead =
      xWeightedLength(OPEN_QUOTE) +
      xWeightedLength(CLOSE_QUOTE) +
      1 +
      xWeightedLength(COMPACT_TAIL);
    const quote = truncateToWeight(
      statement,
      Math.max(0, X_TEXT_BUDGET - overhead),
    );
    return `${OPEN_QUOTE}${quote}${CLOSE_QUOTE} ${COMPACT_TAIL}`;
  }

  return `${OPEN_QUOTE}${statement}${CLOSE_QUOTE} ${LONG_TAIL}`;
}

/** True when `buildShareText` would use the signer's own words. */
export function hasShareStatement(whyISigned?: string | null): boolean {
  return normalizeWhyISigned(whyISigned) !== null;
}
