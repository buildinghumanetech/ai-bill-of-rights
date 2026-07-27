/**
 * What the signer OG card is allowed to hand satori.
 *
 * These assertions are deliberately about the STRING, not the rendered PNG.
 * The previous guard for this behaviour rendered the route and checked the
 * image came back 1200x630 — but satori emits a 1200x630 canvas for any input
 * whatsoever, so that assertion passed identically with the clamp removed. It
 * could not fail. Everything below can: delete the clamp in
 * `normalizeWhyISigned` and these go red.
 */

import { describe, expect, it } from "vitest";
import { signerCardQuote, quoteStyle } from "@/lib/og/signer-quote";
import { MAX_WHY_I_SIGNED_LENGTH } from "@/lib/why-i-signed";

const CAP = MAX_WHY_I_SIGNED_LENGTH;
const LONE_SURROGATE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

describe("signerCardQuote", () => {
  it("gives the renderer nothing when there is no statement", () => {
    expect(signerCardQuote(null).text).toBeNull();
    expect(signerCardQuote("").text).toBeNull();
    expect(signerCardQuote("   ").text).toBeNull();
  });

  it("passes a short statement through untouched", () => {
    const q = signerCardQuote("Because my kids deserve better.");
    expect(q.text).toBe("Because my kids deserve better.");
  });

  it("clamps a legacy over-long row to the cap before the renderer sees it", () => {
    // A row written before the cap existed. The route re-normalises on the way
    // out, so what reaches satori is capped no matter what is in the column.
    const q = signerCardQuote("x".repeat(1000));
    expect(q.text).toHaveLength(CAP);
    expect(q.text).toBe("x".repeat(CAP));
  });

  it("clamps every over-long shape to at most the cap", () => {
    const shapes = [
      "x".repeat(1000),
      "word ".repeat(400),
      "😀".repeat(500),
      "你好".repeat(400),
      `${"a".repeat(CAP - 1)}😀 trailing words`,
    ];
    for (const raw of shapes) {
      const { text } = signerCardQuote(raw);
      expect(text!.length).toBeLessThanOrEqual(CAP);
      // Half a character is worse than a missing one: satori draws a lone
      // surrogate as a replacement box.
      expect(LONE_SURROGATE.test(text!)).toBe(false);
    }
  });

  it("flattens newlines, so the one-line panel stays one line", () => {
    const { text } = signerCardQuote("first line\nsecond line\r\nthird");
    expect(text).toBe("first line second line third");
    expect(text).not.toContain("\n");
  });

  it("sizes the quote down as it gets longer, and never below the floor", () => {
    // The size is picked from the clamped length, so an unbounded row cannot
    // sneak past the smallest size into a layout that overflows the canvas.
    expect(signerCardQuote("short").fontSize).toBe(32);
    expect(signerCardQuote("x".repeat(100)).fontSize).toBe(27);
    expect(signerCardQuote("x".repeat(150)).fontSize).toBe(23);
    expect(signerCardQuote("x".repeat(CAP)).fontSize).toBe(20);
    // The 1000-char row must be sized as the 200-char string it became, which
    // is the same bucket — the point is that it is sized from clamped text.
    expect(signerCardQuote("x".repeat(1000)).fontSize).toBe(
      quoteStyle(CAP).fontSize,
    );
  });

  it("never returns a length the sizing table was not measured against", () => {
    // quoteStyle's largest bucket was checked by rendering 200 characters.
    // If the clamp ever regresses, this is the assertion that catches it.
    const worst = signerCardQuote("你".repeat(5000));
    expect(worst.text!.length).toBeLessThanOrEqual(CAP);
  });
});
