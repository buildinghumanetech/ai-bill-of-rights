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

/** The version published immediately before `current`, per versions.json order. */
function previousVersion(): string {
  const idx = versionsIndex.history.findIndex(
    (h) => h.version === versionsIndex.current,
  );
  return versionsIndex.history[idx - 1].version;
}

describe("bill of rights content index", () => {
  it("names the newest history entry as the current version", () => {
    const newest =
      versionsIndex.history[versionsIndex.history.length - 1].version;
    expect(versionsIndex.current).toBe(newest);
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

  it("carries every article from the previous version over verbatim", () => {
    // A published version's markdown hash is locked once synced, so a new
    // version may only ADD articles — never silently reword an existing one.
    const previous = parseDocument(readVersionFile(previousVersion(), "md"));
    const textOf = (doc: typeof previous, id: string) =>
      doc.articles
        .find((a) => a.id === id)!
        .paragraphs.flatMap((p) => p.sentences.map((s) => s.text))
        .join(" ");

    for (const prior of previous.articles) {
      const carried = parsed.articles.find((a) => a.id === prior.id);
      expect(carried, `${prior.id} was dropped`).toBeDefined();
      expect(textOf(parsed, prior.id), `${prior.id} text drifted`).toBe(
        textOf(previous, prior.id),
      );
      expect(carried!.title, `${prior.id} title drifted`).toBe(prior.title);
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

  /**
   * The homepage splits each article into `body` + `pullQuote`, where the pull
   * quote is the article's closing line. Rejoined, they must reproduce the
   * canonical text exactly — otherwise the homepage displays wording that is
   * not in the document people are actually signing.
   *
   * Four articles predate this test and already diverge. They are listed here
   * rather than silently tolerated, so the exemption is visible and shrinkable:
   *
   *   01 — canonical closes "The default is no."; homepage shows
   *        'The default is "No LLM training on my data"'
   *   02 — canonical "Memory built on your life is yours." vs "LLM memory ..."
   *   05 — homepage pull quote is a paraphrase; canonical has no closing line
   *   06 — homepage pull quote is about an AI agent "license plate", which
   *        appears NOWHERE in the canonical document
   *
   * Do not add to this list. New articles must match exactly.
   */
  const KNOWN_PULLQUOTE_DIVERGENCES = new Set(["01", "02", "05", "06"]);

  it("reproduces the canonical text as body + pullQuote", () => {
    homepageArticles.forEach((article, idx) => {
      if (KNOWN_PULLQUOTE_DIVERGENCES.has(article.number)) return;
      const canonical = documentArticles[idx].paragraphs
        .flatMap((p) => p.sentences.map((s) => s.text))
        .join(" ");
      const rejoined = article.pullQuote
        ? `${article.body} ${article.pullQuote}`
        : article.body;
      expect(rejoined, `article ${article.number}`).toBe(canonical);
    });
  });

  it("keeps the exemption list honest — every listed article really does diverge", () => {
    // If someone fixes a legacy pull quote, this fails and tells them to shrink
    // the list, so the exemption can never outlive the problem.
    for (const number of KNOWN_PULLQUOTE_DIVERGENCES) {
      const idx = homepageArticles.findIndex((a) => a.number === number);
      const article = homepageArticles[idx];
      const canonical = documentArticles[idx].paragraphs
        .flatMap((p) => p.sentences.map((s) => s.text))
        .join(" ");
      const rejoined = article.pullQuote
        ? `${article.body} ${article.pullQuote}`
        : article.body;
      expect(
        rejoined,
        `article ${number} now matches the canonical text — remove it from KNOWN_PULLQUOTE_DIVERGENCES`,
      ).not.toBe(canonical);
    }
  });

  it("keeps each article body a prefix of the canonical text", () => {
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
