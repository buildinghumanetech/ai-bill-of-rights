/**
 * The cap on "why I signed" is enforced in two places that used to disagree:
 * `normalizeWhyISigned` (what gets STORED and rendered) and
 * `exceedsWhyISignedCap` (what the signer is TOLD happened to their words).
 *
 * These tests pin the reconciliation:
 *   - one definition, measured in UTF-16 code units on the CLEANED text —
 *     matching the textarea's `maxlength` and counter, which is the only
 *     length a signer ever actually sees;
 *   - the invariant `exceedsWhyISignedCap(raw) === (normalize(raw) !== clean(raw))`,
 *     i.e. we claim to have trimmed exactly when we trimmed;
 *   - the boundary itself: at the cap, one under, one over — with astral
 *     characters and combining marks, which is precisely where a code-unit
 *     slice and a human-visible character count part company.
 */

import { describe, expect, it } from "vitest";
import {
  MAX_WHY_I_SIGNED_LENGTH,
  exceedsWhyISignedCap,
  normalizeWhyISigned,
  whyISignedLength,
} from "@/lib/why-i-signed";

const CAP = MAX_WHY_I_SIGNED_LENGTH;
/** Any unpaired surrogate in the output means we cut a character in half. */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

describe("the cap boundary", () => {
  it("keeps a statement of exactly the cap intact", () => {
    const at = "a".repeat(CAP);
    expect(normalizeWhyISigned(at)).toBe(at);
    expect(exceedsWhyISignedCap(at)).toBe(false);
    expect(whyISignedLength(at)).toBe(CAP);
  });

  it("keeps a statement one under the cap intact", () => {
    const under = "a".repeat(CAP - 1);
    expect(normalizeWhyISigned(under)).toBe(under);
    expect(exceedsWhyISignedCap(under)).toBe(false);
  });

  it("trims a statement one over the cap, and says so", () => {
    const over = "a".repeat(CAP + 1);
    expect(normalizeWhyISigned(over)).toBe("a".repeat(CAP));
    expect(exceedsWhyISignedCap(over)).toBe(true);
  });
});

describe("normalizeWhyISigned and exceedsWhyISignedCap agree", () => {
  const cases: Array<[name: string, raw: unknown]> = [
    ["empty", ""],
    ["whitespace only", "   \n\t "],
    ["non-string", 42],
    ["short", "Because my kids deserve better."],
    ["exactly at the cap", "a".repeat(CAP)],
    ["one over", "a".repeat(CAP + 1)],
    ["padded with newlines but short once collapsed", `\n\n${"a".repeat(50)}\n\n`],
    ["long only because of repeated spaces", "a b".padEnd(600, " c")],
    // The case the old implementation got wrong: `\s` does not match NUL, so
    // the old exceeds-check measured 301 while normalising stored 1 character.
    ["padded with control characters", `a${"\u0000".repeat(300)}`],
    ["emoji straddling the boundary", `${"a".repeat(CAP - 1)}😀tail`],
    ["combining mark straddling the boundary", `${"a".repeat(CAP - 1)}e\u0301tail`],
  ];

  for (const [name, raw] of cases) {
    it(`holds the invariant for: ${name}`, () => {
      const normalized = normalizeWhyISigned(raw);
      const cleanedLength = whyISignedLength(raw);
      // "We trimmed you" is true exactly when the stored text differs from the
      // cleaned text — never merely because the raw input was long.
      const actuallyTrimmed =
        cleanedLength > 0 && (normalized ?? "").length !== cleanedLength;
      expect(exceedsWhyISignedCap(raw)).toBe(actuallyTrimmed);
      if (normalized !== null) {
        expect(normalized.length).toBeLessThanOrEqual(CAP);
      }
    });
  }

  it("does not claim to have trimmed text it merely collapsed", () => {
    const raw = `a${"\u0000".repeat(300)}`;
    expect(normalizeWhyISigned(raw)).toBe("a");
    expect(exceedsWhyISignedCap(raw)).toBe(false);
  });
});

describe("multi-byte characters at the boundary", () => {
  it("never leaves half of a surrogate pair behind", () => {
    // 199 ASCII + an emoji = 201 code units. A naive slice(0, 200) keeps the
    // emoji's high surrogate and drops its low one, producing text no renderer
    // can draw.
    const raw = `${"a".repeat(CAP - 1)}😀 and more words after it`;
    expect(raw.length).toBeGreaterThan(CAP);
    const out = normalizeWhyISigned(raw)!;
    expect(out).toBe("a".repeat(CAP - 1));
    expect(out.length).toBeLessThanOrEqual(CAP);
    expect(LONE_SURROGATE.test(out)).toBe(false);
    expect(exceedsWhyISignedCap(raw)).toBe(true);
  });

  it("keeps an emoji whole when it ends exactly at the cap", () => {
    const raw = `${"a".repeat(CAP - 2)}😀`;
    expect(raw.length).toBe(CAP);
    expect(normalizeWhyISigned(raw)).toBe(raw);
    expect(exceedsWhyISignedCap(raw)).toBe(false);
  });

  it("counts an all-emoji statement in code units, like the counter does", () => {
    // 150 emoji = 300 code units. The textarea would have stopped the signer at
    // 100 of them; a grapheme-based cap would have let all 150 through and
    // handed the OG renderer 300 units of text sized as if it were 150.
    const raw = "😀".repeat(150);
    expect(exceedsWhyISignedCap(raw)).toBe(true);
    const out = normalizeWhyISigned(raw)!;
    expect(out.length).toBeLessThanOrEqual(CAP);
    expect(LONE_SURROGATE.test(out)).toBe(false);
    expect(out).toBe("😀".repeat(CAP / 2));
  });

  it("never orphans a combining mark from its base character", () => {
    // 199 ASCII + "e" + U+0301 (combining acute) = 201 code units. Slicing at
    // 200 keeps the bare "e" and drops its accent, silently changing the word.
    const raw = `${"a".repeat(CAP - 1)}e\u0301 and more words after it`;
    const out = normalizeWhyISigned(raw)!;
    expect(out).toBe("a".repeat(CAP - 1));
    expect(out.endsWith("e")).toBe(false);
    expect(/\p{M}/u.test(out.slice(-1))).toBe(false);
  });

  it("keeps a base + mark cluster whole when it ends exactly at the cap", () => {
    const raw = `${"a".repeat(CAP - 2)}e\u0301`;
    expect(raw.length).toBe(CAP);
    expect(normalizeWhyISigned(raw)).toBe(raw);
    expect(exceedsWhyISignedCap(raw)).toBe(false);
  });

  it("drops a whole stack of combining marks rather than part of it", () => {
    // A base with two stacked marks straddling the cut: all three go, or none do.
    const raw = `${"a".repeat(CAP - 2)}e\u0301\u0308 tail`;
    const out = normalizeWhyISigned(raw)!;
    expect(out).toBe("a".repeat(CAP - 2));
    expect(/\p{M}/u.test(out)).toBe(false);
  });
});

describe("sanitising", () => {
  it("collapses newlines and control characters into single spaces", () => {
    expect(normalizeWhyISigned("a\n\n\tb\u0000c")).toBe("a b c");
  });

  it("returns null for text that is not usable", () => {
    expect(normalizeWhyISigned("")).toBeNull();
    expect(normalizeWhyISigned("   ")).toBeNull();
    expect(normalizeWhyISigned("\u0000\u0007")).toBeNull();
    expect(normalizeWhyISigned(null)).toBeNull();
    expect(normalizeWhyISigned(undefined)).toBeNull();
    expect(normalizeWhyISigned(12345)).toBeNull();
  });

  it("never reports a cap violation for input it rejects outright", () => {
    expect(exceedsWhyISignedCap(null)).toBe(false);
    expect(exceedsWhyISignedCap("")).toBe(false);
    expect(exceedsWhyISignedCap({ length: 9999 })).toBe(false);
  });
});
