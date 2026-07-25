import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseDocument } from "@/lib/markdown/parse";
import { articles as homepageArticles } from "@/app/HomepageArticles";

/**
 * The canonical document lives in `content/bill-of-rights/v<version>.md`, but the
 * homepage renders a hand-maintained copy of the same text from the `articles`
 * array in `HomepageArticles.tsx` (it needs per-sentence comment anchors that the
 * markdown renderer doesn't provide). Those two sources can silently drift — a
 * new Article added to one and not the other, or a "Connects to" pill pointing at
 * a resource slug that has no file. These tests are the guard against that.
 */

const CONTENT_ROOT = path.join(process.cwd(), "content", "bill-of-rights");
const RESOURCES_ROOT = path.join(process.cwd(), "content", "resources");

interface VersionsJson {
  current: string;
  history: Array<{ version: string; published_at: string; changelog: string }>;
}

const versionsIndex: VersionsJson = JSON.parse(
  fs.readFileSync(path.join(CONTENT_ROOT, "versions.json"), "utf-8"),
);

function readVersionFile(version: string, ext: string): string {
  return fs.readFileSync(path.join(CONTENT_ROOT, `v${version}.${ext}`), "utf-8");
}

describe("bill of rights content index", () => {
  it("names 0.1.0 as the current version", () => {
    expect(versionsIndex.current).toBe("0.1.0");
  });

  it("has every history entry backed by all three files on disk", () => {
    for (const entry of versionsIndex.history) {
      for (const ext of ["md", "agents.md", "spec.json"]) {
        const file = path.join(CONTENT_ROOT, `v${entry.version}.${ext}`);
        expect(fs.existsSync(file), `${path.basename(file)} is missing`).toBe(
          true,
        );
      }
    }
  });

  it("lists the current version in its own history", () => {
    expect(versionsIndex.history.map((h) => h.version)).toContain(
      versionsIndex.current,
    );
  });
});

describe("current version document", () => {
  const parsed = parseDocument(readVersionFile(versionsIndex.current, "md"));
  const documentArticles = parsed.articles.filter((a) => a.id !== "preamble");

  it("declares its own version in frontmatter", () => {
    expect(parsed.frontmatter.version).toBe(versionsIndex.current);
  });

  it("has a preamble followed by 11 sequentially numbered articles", () => {
    expect(parsed.articles[0].id).toBe("preamble");
    expect(documentArticles.map((a) => a.id)).toEqual(
      Array.from({ length: 11 }, (_, i) => `article-${i + 1}`),
    );
  });

  it("gives every sentence an anchor id namespaced to its article", () => {
    for (const article of documentArticles) {
      for (const paragraph of article.paragraphs) {
        expect(paragraph.sentences.length).toBeGreaterThan(0);
        for (const sentence of paragraph.sentences) {
          expect(sentence.id).toMatch(
            new RegExp(`^${article.id}-s-\\d+$`),

          );
          expect(sentence.text).not.toContain("{#");
        }
      }
    }
  });

  it("carries Articles 1-9 over from v0.0.1 verbatim", () => {
    const previous = parseDocument(readVersionFile("0.0.1", "md"));
    const textOf = (doc: typeof previous, id: string) =>
      doc.articles
        .find((a) => a.id === id)!
        .paragraphs.flatMap((p) => p.sentences.map((s) => s.text))
        .join(" ");

    for (let i = 1; i <= 9; i++) {
      const id = `article-${i}`;
      expect(textOf(parsed, id), `${id} text drifted`).toBe(
        textOf(previous, id),
      );
      expect(
        parsed.articles.find((a) => a.id === id)!.title,
        `${id} title drifted`,
      ).toBe(previous.articles.find((a) => a.id === id)!.title);
    }
  });
});

describe("current version spec.json", () => {
  const spec = JSON.parse(readVersionFile(versionsIndex.current, "spec.json"));

  it("matches the version it is filed under", () => {
    expect(spec.version).toBe(versionsIndex.current);
  });

  it("has one principle per article, numbered 1-11", () => {
    expect(spec.principles.map((p: { id: number }) => p.id)).toEqual(
      Array.from({ length: 11 }, (_, i) => i + 1),
    );
  });

  it("gives every principle a unique slug and at least one reference", () => {
    const slugs = spec.principles.map((p: { slug: string }) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const p of spec.principles) {
      expect(p.slug).toMatch(/^[a-z0-9-]+$/);
      expect(p.references.length, `${p.slug} has no references`).toBeGreaterThan(
        0,
      );
    }
  });
});

describe("homepage articles array", () => {
  const parsed = parseDocument(readVersionFile(versionsIndex.current, "md"));
  const documentArticles = parsed.articles.filter((a) => a.id !== "preamble");

  it("has the same number of articles as the canonical document", () => {
    expect(homepageArticles).toHaveLength(documentArticles.length);
  });

  it("numbers articles 01-11 in order", () => {
    expect(homepageArticles.map((a) => a.number)).toEqual(
      Array.from({ length: 11 }, (_, i) => String(i + 1).padStart(2, "0")),
    );
  });

  it("uses the same title as the canonical document for each article", () => {
    homepageArticles.forEach((article, idx) => {
      // Canonical headings are prefixed "Article N: "; the homepage stores the
      // bare title and renders the number separately.
      const canonical = documentArticles[idx].title.replace(
        /^Article \d+:\s*/,
        "",
      );
      expect(article.title, `article ${article.number}`).toBe(canonical);
    });
  });

  it("keeps each article body a prefix of the canonical text", () => {
    // The homepage body drops the closing line, which is promoted to pullQuote.
    homepageArticles.forEach((article, idx) => {
      const canonical = documentArticles[idx].paragraphs
        .flatMap((p) => p.sentences.map((s) => s.text))
        .join(" ");
      expect(
        canonical.startsWith(article.body),
        `article ${article.number} body is not a prefix of the canonical text`,
      ).toBe(true);
    });
  });

  it("points every 'Connects to' pill at a resource file that exists", () => {
    for (const article of homepageArticles) {
      for (const pill of article.connects ?? []) {
        const file = path.join(RESOURCES_ROOT, `${pill.slug}.md`);
        expect(
          fs.existsSync(file),
          `article ${article.number} links to /resources/${pill.slug}, but ${pill.slug}.md does not exist`,
        ).toBe(true);
      }
    }
  });

  it("gives the two new articles their own pills", () => {
    const byNumber = new Map(homepageArticles.map((a) => [a.number, a]));
    expect(byNumber.get("10")?.connects?.length).toBeGreaterThan(0);
    expect(byNumber.get("11")?.connects?.length).toBeGreaterThan(0);
  });
});
