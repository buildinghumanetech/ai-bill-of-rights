/**
 * The X share text has to fit X's counter, not JavaScript's.
 *
 * X weights code points: 1 for its four "light" ranges (U+0000–U+10FF, plus
 * three narrow punctuation blocks), 2 for everything else — so every CJK and
 * Japanese character, every emoji, and the "…" the truncation itself appends
 * all cost double. And X charges a flat 23 for any URL however long. So the
 * interesting case is not a typical English sentence, which fits with room to
 * spare; it is a statement made entirely of double-weight characters, which a
 * `.length` budget waves through at roughly twice the real cost and X then
 * rejects.
 */

import { describe, expect, it } from "vitest";
import {
  GENERIC_SHARE_TEXT,
  X_POST_LIMIT,
  X_URL_WEIGHT,
  buildShareText,
  xPostWeight,
  xWeightedLength,
} from "@/lib/share/share-text";
import { MAX_WHY_I_SIGNED_LENGTH } from "@/lib/why-i-signed";

const CAP = MAX_WHY_I_SIGNED_LENGTH;
const LONE_SURROGATE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

describe("xWeightedLength", () => {
  it("charges 1 per character for plain Latin text", () => {
    expect(xWeightedLength("hello world")).toBe(11);
  });

  it("charges 1 for the punctuation X puts in its light ranges", () => {
    // U+201C/U+201D curly quotes and U+2014 em dash all sit in 2010–201F.
    expect(xWeightedLength("“”—")).toBe(3);
  });

  it("charges 2 for CJK, emoji and other heavy code points", () => {
    expect(xWeightedLength("你好")).toBe(4); // 你好
    expect(xWeightedLength("😀")).toBe(2); // 😀, one code point
    expect(xWeightedLength("…")).toBe(2); // … is NOT in a light range
  });
});

describe("buildShareText for X stays inside the limit", () => {
  /** Statements that cost double per character — the worst case, not a typical one. */
  const worstCases: Array<[string, string]> = [
    ["CJK at the cap", "你".repeat(CAP)],
    ["emoji at the cap", "😀".repeat(CAP / 2)],
    ["Japanese at the cap", "ありがとう".repeat(CAP / 5)],
    ["Devanagari at the cap (light range, but non-ASCII)", "क".repeat(CAP)],
    ["CJK with no spaces to break on", "你好世界".repeat(CAP / 4)],
    ["mixed heavy and light", `${"你".repeat(100)} ${"a".repeat(100)}`],
    ["ASCII at the cap", "a".repeat(CAP)],
    ["long English words", "extraordinarily ".repeat(20)],
  ];

  for (const [name, statement] of worstCases) {
    it(`fits with the URL appended: ${name}`, () => {
      const text = buildShareText({ whyISigned: statement, channel: "x" });
      // The number X actually applies: text + separating space + flat URL cost.
      expect(xPostWeight(text)).toBeLessThanOrEqual(X_POST_LIMIT);
      // And no character was cut in half getting there.
      expect(LONE_SURROGATE.test(text)).toBe(false);
      expect(text).toContain("Add your name too:");
    });
  }

  it("would blow the limit if the budget were measured in .length", () => {
    // Guards the premise: this input really is the case a naive budget misses.
    const statement = "你".repeat(CAP);
    expect(statement.length).toBe(CAP);
    expect(xWeightedLength(statement)).toBe(CAP * 2);
    expect(xWeightedLength(statement) + 1 + X_URL_WEIGHT).toBeGreaterThan(
      X_POST_LIMIT,
    );
    // ...and the built text does not.
    expect(xPostWeight(buildShareText({ whyISigned: statement, channel: "x" })))
      .toBeLessThanOrEqual(X_POST_LIMIT);
  });

  it("truncates with an ellipsis and pays for it", () => {
    const text = buildShareText({
      whyISigned: "你".repeat(CAP),
      channel: "x",
    });
    expect(text).toContain("…");
    expect(xPostWeight(text)).toBeLessThanOrEqual(X_POST_LIMIT);
  });

  it("leaves a statement that genuinely fits alone", () => {
    const statement = "Because my kids will grow up with this technology.";
    const text = buildShareText({ whyISigned: statement, channel: "x" });
    expect(text).toContain(statement);
    expect(text).not.toContain("…");
    expect(xPostWeight(text)).toBeLessThanOrEqual(X_POST_LIMIT);
  });

  it("keeps the generic copy inside the limit too", () => {
    const text = buildShareText({ whyISigned: null, channel: "x" });
    expect(text).toBe(GENERIC_SHARE_TEXT);
    expect(xPostWeight(text)).toBeLessThanOrEqual(X_POST_LIMIT);
  });

  it("holds for arbitrary statements the cap admits", () => {
    // A blunt sweep over lengths and scripts, since the truncation walks code
    // points and the off-by-one lives at a boundary somewhere in here.
    const scripts = ["a", "你", "😀", "क", "é"];
    for (const unit of scripts) {
      for (let n = 1; n <= CAP; n++) {
        const text = buildShareText({
          whyISigned: unit.repeat(n),
          channel: "x",
        });
        expect(xPostWeight(text)).toBeLessThanOrEqual(X_POST_LIMIT);
      }
    }
  });
});

describe("non-X channels are unaffected", () => {
  it("uses the long tail and does not truncate", () => {
    const statement = "你".repeat(CAP);
    const text = buildShareText({ whyISigned: statement, channel: "linkedin" });
    expect(text).toContain(statement);
    expect(text).toContain("That's why I signed");
  });
});
