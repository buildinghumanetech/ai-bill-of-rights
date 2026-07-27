/**
 * "Why I signed" — the one-sentence statement a signer optionally writes after
 * their signature lands.
 *
 * The text is public: it renders into the signer's page, their OG share card,
 * and the default share copy. So the cap and the sanitising live HERE, on the
 * server side of the fence, and the client-side counter in SignModal is only a
 * courtesy. Anything that writes `signers.why_i_signed` must go through
 * `normalizeWhyISigned` first.
 *
 * ─── MODULE BOUNDARY — READ BEFORE MERGING ANYTHING INTO THIS FILE ───
 * This module is PURE: string in, string out. It must keep importing nothing
 * but other pure modules — no drizzle, no `@/lib/db/*`, no `next/*` server
 * APIs, no `@clerk/nextjs/server`.
 *
 * The reason is bundle size, not taste. `SignModal.tsx` is a "use client"
 * component and it imports `MAX_WHY_I_SIGNED_LENGTH` from here; so does
 * `@/lib/share/share-text`, which the same client component imports. Anything
 * this file imports is therefore dragged into the browser bundle for every
 * visitor to the home page. When the drizzle query helper lived here it pulled
 * `drizzle-orm` and the whole `@/lib/db/schema` table graph down the wire to
 * people who were only ever going to read a character counter.
 *
 * The database side of the feature lives in `./why-i-signed.server.ts`. Keep
 * it there.
 */

/**
 * Hard cap, measured in UTF-16 code units.
 *
 * Code units — not grapheme clusters — because that is the unit the signer is
 * actually shown at input time: the textarea in SignModal carries
 * `maxLength={MAX_WHY_I_SIGNED_LENGTH}` (the HTML `maxlength` attribute is
 * defined on code-unit length) and the counter beside it renders
 * `whyInput.length`. A grapheme-cluster cap would let the counter read "200/200"
 * while the server happily stored a string twice that long in code units, and
 * the OG card cannot absorb that: `quoteStyle()` in the signer OG route picks a
 * font size from the code-unit count, and its largest-text case was measured
 * against 200 code units. So the user-visible definition wins, and it also
 * happens to be the one the renderer can fit.
 */
export const MAX_WHY_I_SIGNED_LENGTH = 200;

/** Combining marks — the things that must never be orphaned from their base. */
const COMBINING_MARK = /\p{M}/u;

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

/**
 * The cleaning half of the pipeline, shared by every public entry point below
 * so they can never drift apart on what the text even *is* before it gets
 * measured. Returns null for anything that isn't usable text.
 */
function cleanWhyISigned(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw
    // Control characters (including newlines) become spaces: this is a single
    // sentence rendered on one canvas, not a multi-paragraph field.
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length === 0 ? null : cleaned;
}

/**
 * Cut `cleaned` down to the cap without producing text no renderer can draw.
 *
 * A bare `.slice(0, 200)` cuts at a code-unit index, which lands mid-character
 * in exactly the two places real people hit:
 *   - inside a surrogate pair (any emoji, any astral script), leaving a lone
 *     surrogate — an unpaired code unit that is not valid text and comes out of
 *     satori and JSON as a replacement character;
 *   - between a base letter and its combining mark, turning "é" (e + U+0301)
 *     into a bare "e" plus an orphan accent that reattaches to whatever
 *     precedes it downstream.
 * Both are avoided by walking the cut point backwards, so the result can be up
 * to a couple of code units under the cap. Under is fine; broken is not.
 */
function clampToCap(cleaned: string): string {
  if (cleaned.length <= MAX_WHY_I_SIGNED_LENGTH) return cleaned;
  let end = MAX_WHY_I_SIGNED_LENGTH;
  // If the first dropped unit is a combining mark, its base is still inside the
  // cut — drop the whole cluster rather than stranding the mark's base bare.
  while (end > 0 && COMBINING_MARK.test(cleaned.charAt(end))) end--;
  // Never split a surrogate pair down the middle.
  if (end > 0 && isHighSurrogate(cleaned.charCodeAt(end - 1))) end--;
  return cleaned.slice(0, end).replace(/\s+$/, "");
}

/**
 * Collapse whitespace, strip control characters, trim, and enforce the cap.
 *
 * Returns `null` for anything that isn't usable text (empty, whitespace-only,
 * non-string) so callers can store SQL NULL rather than an empty string — the
 * "no statement" branch everywhere downstream tests for null/empty.
 */
export function normalizeWhyISigned(raw: unknown): string | null {
  const cleaned = cleanWhyISigned(raw);
  if (cleaned === null) return null;
  const clamped = clampToCap(cleaned);
  return clamped.length === 0 ? null : clamped;
}

/**
 * The length the cap is measured against: code units of the CLEANED text, so a
 * paste full of newlines or a stray NUL isn't counted as over-long when
 * normalising is about to collapse it away.
 */
export function whyISignedLength(raw: unknown): number {
  return cleanWhyISigned(raw)?.length ?? 0;
}

/**
 * True when the input exceeds the cap and would be silently shortened.
 * The server action uses this to tell the user their words were trimmed.
 *
 * Defined in terms of `normalizeWhyISigned` rather than re-deriving the rules,
 * because the two used to disagree and the disagreement was user-visible: the
 * old version skipped the control-character pass and measured raw `.length`, so
 * a statement padded with NULs (or any other C0 character `\s` does not match)
 * reported "we trimmed your words" about text that normalising had merely
 * collapsed and stored whole. The invariant this now guarantees, and that
 * tests/lib/why-i-signed.cap.test.ts pins: `exceedsWhyISignedCap(raw)` is true
 * exactly when normalising actually dropped characters.
 */
export function exceedsWhyISignedCap(raw: unknown): boolean {
  const cleaned = cleanWhyISigned(raw);
  if (cleaned === null) return false;
  return normalizeWhyISigned(raw) !== cleaned;
}
