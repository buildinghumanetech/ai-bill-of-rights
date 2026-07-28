import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ARTICLES, GRID_PLACEHOLDER } from "@/app/api/og/articles";

/**
 * Tripwire for the homepage OG card's hand-written article short-forms.
 * The full rationale lives next to `ARTICLES` in `src/app/api/og/articles.ts`.
 */

const CONTENT_DIR = path.join(process.cwd(), "content", "bill-of-rights");
const HEADING_RE = /^##\s+Article\s+(\d+):\s*(.+?)\s*(?:\{#[^}]*\})?\s*$/gm;

function currentVersion(): string {
  const raw = readFileSync(path.join(CONTENT_DIR, "versions.json"), "utf8");
  return JSON.parse(raw).current as string;
}

interface Heading {
  number: number;
  title: string;
}

/**
 * Parse the `## Article N: Title` headings out of the current version.
 *
 * Throws rather than returning [] when nothing matches: a silent empty result
 * would make the comparison tests pass vacuously over zero iterations, which
 * is the opposite of what a tripwire should do.
 */
function articleHeadings(): Heading[] {
  const version = currentVersion();
  const file = path.join(CONTENT_DIR, `v${version}.md`);
  const md = readFileSync(file, "utf8");
  const found = [...md.matchAll(HEADING_RE)].map((m) => ({
    number: Number(m[1]),
    title: m[2],
  }));
  if (found.length === 0) {
    throw new Error(
      `No "## Article N: ..." headings parsed from ${file}. Either the ` +
        `document's heading format changed or HEADING_RE in this test is ` +
        `stale — fix the parser before trusting any drift result.`,
    );
  }
  return found;
}

describe("homepage OG card article list", () => {
  it("has one short form per article in the current version", () => {
    expect(ARTICLES).toHaveLength(articleHeadings().length);
  });

  it("fills a 3-across, 4-down grid once the placeholder cell is counted", () => {
    // The card lays the articles out in four rows of three. v0.1.0 took the
    // document from nine to eleven, so the grid that used to be exactly full
    // now has one cell spare — GRID_PLACEHOLDER occupies it deliberately.
    // A count that is neither 11 nor 12-with-placeholder breaks the layout,
    // not just the copy.
    expect(ARTICLES).toHaveLength(11);
    expect([...ARTICLES, GRID_PLACEHOLDER]).toHaveLength(12);
  });

  it("keeps the article numbers sequential with none skipped", () => {
    // Note the limit of this check: it validates the document's internal
    // consistency, not card-vs-document drift. Reordering articles and
    // renumbering them to stay sequential still passes here — the fuzzy
    // word-overlap test below is what actually catches a reorder.
    const numbers = articleHeadings().map((h) => h.number);
    expect(numbers).toEqual(
      Array.from({ length: numbers.length }, (_, i) => i + 1),
    );
  });

  it("keeps each short form recognisably tied to its article", () => {
    const headings = articleHeadings();
    // Gate on length first. Without this, a removed article makes
    // headings[i] undefined and the loop throws a TypeError instead of the
    // actionable message below — on exactly the drift this test exists for.
    expect(
      ARTICLES.length,
      "Article count changed; update ARTICLES in src/app/api/og/articles.ts",
    ).toBe(headings.length);

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
      const headingStems = stems(headings[i].title);
      const shared = [...stems(short)].filter((w) => headingStems.has(w));
      expect(
        shared.length,
        `Short form ${i + 1} ("${short}") shares no distinctive word with ` +
          `article ${i + 1} ("${headings[i].title}"). If the document ` +
          `changed, update ARTICLES in src/app/api/og/articles.ts.`,
      ).toBeGreaterThan(0);
    });
  });
});
