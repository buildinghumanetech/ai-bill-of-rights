import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseDocument } from "@/lib/markdown/parse";
import { articles as homepageArticles } from "@/app/HomepageArticles";
import { getResource, listResourceSlugs } from "@/lib/resources";

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

/**
 * The version published immediately before `current`, per versions.json order,
 * or null when `current` is the very first entry (nothing to carry over from).
 */
function previousVersion(): string | null {
  const idx = versionsIndex.history.findIndex(
    (h) => h.version === versionsIndex.current,
  );
  if (idx <= 0) return null;
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

  // The changelog is written in two places by hand. Renaming an article means
  // editing both, and nothing else notices if only one is updated.
  it("matches each version's frontmatter changelog to its history entry", () => {
    for (const entry of versionsIndex.history) {
      const { frontmatter } = parseDocument(
        readVersionFile(entry.version, "md"),
      );
      expect(frontmatter.changelog, `v${entry.version} changelog`).toBe(
        entry.changelog,
      );
      expect(frontmatter.version, `v${entry.version} frontmatter version`).toBe(
        entry.version,
      );
    }
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

  /**
   * Articles whose wording DELIBERATELY changed in a given version, relative to
   * the version before it.
   *
   * A new version may of course revise an article — that is what publishing a
   * new version is for. What must never happen is a revision nobody decided on:
   * a stray edit to a carried-forward article reads to signers as text they
   * already agreed to. So every intentional revision is declared here, and
   * anything undeclared still fails.
   *
   * A version with no entry must carry every prior article over verbatim, which
   * is the safe default for the common case (a release that only appends).
   *
   * Note what this does NOT license: changing an article's SENTENCE COUNT
   * silently re-points comment anchors, because comments store `article-N-s-M`.
   * Inserting a sentence mid-article shifts every later anchor in it. See the
   * 0008 migration notes — that is a data question, not just a wording one.
   */
  const DECLARED_REVISIONS: Record<string, Set<string>> = {
    // Erika's final copy. Each of these closes with its pull quote so the
    // canonical text and the homepage finally say the same thing; 5 and 7 also
    // gained a sentence of substance.
    "0.1.0": new Set([
      "article-1", // closing line -> 'The default is "No LLM training on my data."'
      "article-4", // "persuasive dark patterns" -> "deceptive patterns"
      "article-5", // + logging sentence, + closing line
      "article-7", // + COPPA definition of a child
    ]),
  };

  it("carries every article from the previous version over verbatim, unless the revision is declared", () => {
    const prev = previousVersion();
    if (prev === null) return; // first-ever version: nothing to carry over
    const previous = parseDocument(readVersionFile(prev, "md"));
    const revised =
      DECLARED_REVISIONS[versionsIndex.current] ?? new Set<string>();
    const textOf = (doc: typeof previous, id: string) =>
      doc.articles
        .find((a) => a.id === id)!
        .paragraphs.flatMap((p) => p.sentences.map((s) => s.text))
        .join(" ");

    for (const prior of previous.articles) {
      const carried = parsed.articles.find((a) => a.id === prior.id);
      // Dropping an article is never allowed, declared or not: people signed a
      // document containing it.
      expect(carried, `${prior.id} was dropped`).toBeDefined();
      if (revised.has(prior.id)) continue;
      expect(textOf(parsed, prior.id), `${prior.id} text drifted`).toBe(
        textOf(previous, prior.id),
      );
      expect(carried!.title, `${prior.id} title drifted`).toBe(prior.title);
    }
  });

  it("keeps the revision list honest — every declared article really did change", () => {
    // Mirrors the pull-quote exemption check below. Without this, a declaration
    // outlives the revision it described and silently exempts that article from
    // drift detection for every version after.
    const prev = previousVersion();
    if (prev === null) return;
    const previous = parseDocument(readVersionFile(prev, "md"));
    const revised =
      DECLARED_REVISIONS[versionsIndex.current] ?? new Set<string>();
    const textOf = (doc: typeof previous, id: string) =>
      doc.articles
        .find((a) => a.id === id)!
        .paragraphs.flatMap((p) => p.sentences.map((s) => s.text))
        .join(" ");

    for (const id of revised) {
      const prior = previous.articles.find((a) => a.id === id);
      expect(
        prior,
        `${id} is declared revised but does not exist in v${prev} — remove it`,
      ).toBeDefined();
      expect(
        textOf(parsed, id),
        `${id} is declared revised but matches v${prev} — remove it from DECLARED_REVISIONS`,
      ).not.toBe(textOf(previous, id));
    }
  });
});

describe("current version agents.md", () => {
  const raw = readVersionFile(versionsIndex.current, "agents.md");
  const parsed = parseDocument(readVersionFile(versionsIndex.current, "md"));

  it("names the version it is filed under", () => {
    expect(raw).toContain(`v${versionsIndex.current}`);
  });

  const bulletRe = /^- \*\*Article (\d+) — (.+?)\.\*\*/gm;

  /**
   * Which articles the guide is REQUIRED to have a bullet for, derived from the
   * canonical markdown rather than from agents.md itself: every article the
   * current version added relative to the previous one.
   *
   * Deriving it independently is the point. Checking only the bullets that
   * happen to match the expected shape means deleting a bullet, or reformatting
   * one (hyphen for the em dash, dropped trailing period), removes that article
   * from the check instead of failing it — which is exactly the drift this
   * guards against.
   */
  function articlesRequiringABullet(): string[] {
    const prev = previousVersion();
    if (!prev) return [];
    const previous = parseDocument(readVersionFile(prev, "md"));
    const priorIds = new Set(previous.articles.map((a) => a.id));
    return parsed.articles
      .filter((a) => !priorIds.has(a.id))
      .map((a) => a.id.replace(/^article-/, ""));
  }

  // The builder guide restates article titles in "**Article N — <title>.**"
  // bullets. A rename has to be applied here too, and nothing else catches it.
  it("has a conforming bullet for every article this version added", () => {
    const required = articlesRequiringABullet();
    // Nothing to compare: a patch release that adds no articles, or a
    // first-ever version. Both are legitimate and agents.md can be perfectly
    // consistent — matching how the carried-forward test above handles it.
    if (required.length === 0) return;
    const documented = new Set(
      [...raw.matchAll(bulletRe)].map(([, numberStr]) => numberStr),
    );
    for (const numberStr of required) {
      expect(
        documented.has(numberStr),
        `v${versionsIndex.current} added Article ${numberStr}, but v${versionsIndex.current}.agents.md has no "- **Article ${numberStr} — <title>.**" bullet for it (a deleted or reformatted bullet looks the same as a missing one here)`,
      ).toBe(true);
    }
  });

  it("uses the canonical title in every article bullet", () => {
    const bullets = [...raw.matchAll(bulletRe)];
    expect(bullets.length).toBeGreaterThan(0);
    for (const [, numberStr, title] of bullets) {
      const article = parsed.articles.find(
        (a) => a.id === `article-${numberStr}`,
      );
      expect(article, `agents.md references Article ${numberStr}`).toBeDefined();
      const canonical = article!.title.replace(/^Article \d+:\s*/, "");
      expect(title, `Article ${numberStr} title in agents.md`).toBe(canonical);
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
   * This list is now EMPTY, and that is the point of it having existed.
   *
   * Four articles (01, 02, 05, 06) used to diverge: the homepage showed pull
   * quotes that were paraphrases, or in 06's case an AI-agent "license plate"
   * sentence appearing nowhere in the canonical document. Listing them rather
   * than tolerating them kept the gap visible until v0.1.0 closed it — Erika's
   * final copy adopts the homepage wording INTO the canonical text, so every
   * article now closes with its own pull quote.
   *
   * Keep it empty. An article whose homepage wording is not in the document is
   * an article people are signing something different from what they read.
   */
  const KNOWN_PULLQUOTE_DIVERGENCES = new Set<string>([]);

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
      expect(
        idx,
        `article ${number} is not in homepageArticles — update KNOWN_PULLQUOTE_DIVERGENCES`,
      ).toBeGreaterThanOrEqual(0);
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

  it("keeps the exempted articles' bodies a prefix of the canonical text", () => {
    // Weaker than the exact check above, and deliberately so: this is the only
    // coverage the four exempted articles get. Their pull quotes diverge, but
    // their bodies must still be canonical text.
    homepageArticles.forEach((article, idx) => {
      if (!KNOWN_PULLQUOTE_DIVERGENCES.has(article.number)) return;
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

describe("resource pages", () => {
  // /resources/[slug] renders `title`, `subtitle`, and each blank-line-separated
  // body chunk as plain React text nodes — there is no markdown renderer. Any
  // markdown syntax in these files reaches the reader as literal characters.
  //
  // Goes through getResource(), the same parser the page uses, so this can't
  // drift from the real frontmatter handling.
  const slugs = listResourceSlugs();

  it("finds resource files to check", () => {
    expect(slugs.length).toBeGreaterThan(0);
  });

  it("contains no markdown syntax the renderer cannot handle", () => {
    for (const slug of slugs) {
      const resource = getResource(slug);
      expect(resource, `${slug}.md failed to parse`).not.toBeNull();
      // Every field the page renders as a text node.
      const rendered = [
        resource!.title,
        resource!.subtitle,
        resource!.body,
      ].join("\n\n");

      const offenders: string[] = [];
      if (/\*/.test(rendered)) offenders.push("emphasis (*)");
      if (/(^|\s)_[^_\s][^_]*_(\s|$|[.,;:!?])/m.test(rendered))
        offenders.push("underscore emphasis (_)");
      if (/^#{1,6}\s/m.test(rendered)) offenders.push("heading (#)");
      if (/^\s*>/m.test(rendered)) offenders.push("blockquote (>)");
      if (/\[[^\]]*\]\([^)]*\)/.test(rendered)) offenders.push("link ([](…))");
      if (/^\s*[-+]\s+/m.test(rendered)) offenders.push("list item (-)");
      if (/^\s*\d+\.\s+/m.test(rendered)) offenders.push("ordered list (1.)");
      if (/^\s*(=|-){3,}\s*$/m.test(rendered))
        offenders.push("setext underline");
      if (/`/.test(rendered)) offenders.push("code (`)");
      expect(
        offenders,
        `${slug}.md uses ${offenders.join(", ")}, which renders as literal characters`,
      ).toEqual([]);
    }
  });
});
