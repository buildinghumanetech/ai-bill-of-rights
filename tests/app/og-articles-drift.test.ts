import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ARTICLES } from "@/app/api/og/route";

/**
 * The homepage OG card renders nine hand-written short forms of the articles,
 * because the real headings are too long for a 1200x630 card. That paraphrase
 * is a drift risk: the Bill of Rights is a living, versioned document, and an
 * edit to the markdown would leave the share card silently misrepresenting it.
 *
 * These tests are the tripwire. They don't (and can't) assert the paraphrases
 * are well-worded — they assert the card still describes the SAME NUMBER of
 * articles, in the same order, as the current published version. If someone
 * adds a tenth article or reorders them, this fails loudly instead of shipping
 * a stale card to every social feed.
 */

const CONTENT_DIR = path.join(process.cwd(), "content", "bill-of-rights");

function currentVersion(): string {
  const raw = readFileSync(path.join(CONTENT_DIR, "versions.json"), "utf8");
  return JSON.parse(raw).current as string;
}

function articleHeadings(version: string): string[] {
  const md = readFileSync(path.join(CONTENT_DIR, `v${version}.md`), "utf8");
  // Headings look like: `## Article 3: You Have the Right to ... {#article-3}`
  return [...md.matchAll(/^##\s+Article\s+\d+:\s*(.+?)\s*(?:\{#[^}]*\})?\s*$/gm)].map(
    (m) => m[1],
  );
}

describe("homepage OG card article list", () => {
  it("has one short form per article in the current version", () => {
    const headings = articleHeadings(currentVersion());
    expect(headings.length).toBeGreaterThan(0);
    expect(ARTICLES).toHaveLength(headings.length);
  });

  it("renders exactly nine, which is what the 3x3 grid layout assumes", () => {
    // The card lays the articles out in three rows of three. A count that
    // isn't nine would break the layout, not just the copy.
    expect(ARTICLES).toHaveLength(9);
  });

  it("keeps each short form recognisably tied to its article", () => {
    // A weak but useful anchor: every short form should share a distinctive
    // content word with the heading in the same position, so a reordering or
    // a substantive rewrite of an article trips this.
    const headings = articleHeadings(currentVersion());
    const stop = new Set([
      "you", "your", "the", "a", "an", "to", "of", "and", "is", "are", "have",
      "right", "be", "it", "on", "in", "not", "cannot", "who", "they", "with",
      "for", "s", "re", "against", "people", "that", "this", "when", "know",
    ]);
    // Compare on a crude stem so inflections still match: the paraphrase says
    // "manipulation" where the heading says "Manipulated".
    const stems = (s: string) =>
      new Set(
        s
          .toLowerCase()
          .replace(/[^a-z\s]/g, " ")
          .split(/\s+/)
          .filter((w) => w.length > 2 && !stop.has(w))
          .map((w) => w.slice(0, 6)),
      );

    ARTICLES.forEach((short, i) => {
      const headingStems = stems(headings[i]);
      const shared = [...stems(short)].filter((w) => headingStems.has(w));
      expect(
        shared.length,
        `Short form ${i + 1} ("${short}") shares no distinctive word with ` +
          `article ${i + 1} ("${headings[i]}"). If the document changed, ` +
          `update ARTICLES in src/app/api/og/route.tsx.`,
      ).toBeGreaterThan(0);
    });
  });
});
