/**
 * What the signer OG card puts in the pull-quote panel.
 *
 * This lives outside the route on purpose. The route hands its output straight
 * to `ImageResponse`, and satori always emits a 1200x630 canvas no matter what
 * text it is given — so a test that renders the route and checks the PNG's
 * dimensions passes identically whether or not the statement was ever clamped.
 * Pulling the decision out here gives the clamp a return value a test can
 * actually assert on. See tests/lib/og.signer-quote.test.ts.
 *
 * Pure module — no drizzle, no next/og. Keep it that way.
 */

import { normalizeWhyISigned } from "@/lib/why-i-signed";

/** Width of the quote panel in the card, in px. */
export const QUOTE_WIDTH = 456;

export interface SignerCardQuote {
  /** The sanitised, clamped statement, or null when there is nothing to show. */
  text: string | null;
  fontSize: number;
  lineHeight: number;
}

/**
 * Pick a quote size that fills the panel without overflowing it.
 *
 * ImageResponse/satori has no text-overflow safety net — text that doesn't fit
 * simply spills past the canvas — so the size is chosen from the character
 * count rather than measured. The panel is QUOTE_WIDTH wide and roughly 250px
 * tall; these pairings were checked by rendering at 1, ~60, ~120 and 200 chars.
 */
export function quoteStyle(length: number): {
  fontSize: number;
  lineHeight: number;
} {
  if (length <= 60) return { fontSize: 32, lineHeight: 1.32 };
  if (length <= 110) return { fontSize: 27, lineHeight: 1.34 };
  if (length <= 160) return { fontSize: 23, lineHeight: 1.36 };
  return { fontSize: 20, lineHeight: 1.38 };
}

/**
 * Re-clamp on the way out: rows written before the cap existed (or by any
 * future writer that skips the action) must not be able to blow the layout.
 * The renderer never sees the raw column value — only what comes back here.
 */
export function signerCardQuote(rawWhyISigned: unknown): SignerCardQuote {
  const text = normalizeWhyISigned(rawWhyISigned);
  return { text, ...quoteStyle(text?.length ?? 0) };
}
