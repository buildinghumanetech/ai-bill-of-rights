import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  getScorecardEntry,
  listScorecardSlugs,
  loadAllScorecardEntries,
  SCORECARD_DIR,
} from "@/lib/scorecard/load";
import { listPrinciples } from "@/lib/scorecard/principles";
import { assessedCount, isAssessed } from "@/lib/scorecard/types";

const tmpDirs: string[] = [];

function tmpContentDir(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scorecard-"));
  tmpDirs.push(dir);
  for (const [name, body] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), body, "utf-8");
  }
  return dir;
}

afterEach(() => {
  while (tmpDirs.length) fs.rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

describe("principles", () => {
  it("derives the commitments from the published Bill of Rights", () => {
    const principles = listPrinciples();
    expect(principles.length).toBe(11);
    expect(principles.map((p) => p.id)).toEqual([
      "article-1",
      "article-2",
      "article-3",
      "article-4",
      "article-5",
      "article-6",
      "article-7",
      "article-8",
      "article-9",
      "article-10",
      "article-11",
    ]);
    // The `Article N:` prefix is stripped for display.
    expect(principles[0].title).not.toMatch(/^Article/);
  });
});

describe("committed scorecard content", () => {
  it("parses every file under content/scorecard/ without error", () => {
    expect(() => loadAllScorecardEntries()).not.toThrow();
  });

  it("ships the Example AI Labs entry as the format reference", () => {
    const entry = getScorecardEntry("example-ai-labs");
    expect(entry).not.toBeNull();
    expect(entry!.company).toBe("Example AI Labs");
    expect(entry!.fictional).toBe(true);
    // One entry per principle: the loader fills in every commitment the file
    // does not speak to as `not-assessed`, so this tracks the document's
    // article count rather than what the file happens to list.
    expect(entry!.assessments).toHaveLength(11);
    expect(assessedCount(entry!)).toBeGreaterThan(0);
    expect(assessedCount(entry!)).toBeLessThan(11);
  });

  it("gives every committed assessment at least one citation", () => {
    for (const entry of loadAllScorecardEntries()) {
      for (const a of entry.assessments) {
        if (isAssessed(a)) {
          expect(
            a.citations.length,
            `${entry.slug} / ${a.principle.id} has no citation`,
          ).toBeGreaterThan(0);
        } else {
          expect(a.assessment).toBeNull();
          expect(a.citations).toEqual([]);
        }
      }
    }
  });

  it("commits no claims about real companies — every entry is marked fictional", () => {
    // The mechanism ships without verdicts. Real entries are authored by the
    // project owner; until then nothing here may describe a real organisation.
    for (const entry of loadAllScorecardEntries()) {
      expect(entry.fictional, `${entry.slug} is not marked fictional`).toBe(
        true,
      );
    }
  });

  it("excludes README.md from the slug list", () => {
    expect(listScorecardSlugs()).not.toContain("README");
    expect(fs.existsSync(path.join(SCORECARD_DIR, "README.md"))).toBe(true);
  });
});

describe("loadAllScorecardEntries", () => {
  it("returns an empty list when the directory does not exist", () => {
    expect(loadAllScorecardEntries("/nonexistent/scorecard/dir")).toEqual([]);
  });

  it("sorts entries by company name", () => {
    const dir = tmpContentDir({
      "zeta-placeholder.md": `---\ncompany: Zeta Placeholder\nfictional: true\nlastReviewed: 2026-07-24\n---\n`,
      "acme-intelligence-corp.md": `---\ncompany: Acme Intelligence Corp\nfictional: true\nlastReviewed: 2026-07-24\n---\n`,
    });
    expect(loadAllScorecardEntries(dir).map((e) => e.company)).toEqual([
      "Acme Intelligence Corp",
      "Zeta Placeholder",
    ]);
  });

  it("fails loudly — one uncited claim takes down the whole load", () => {
    const dir = tmpContentDir({
      "acme-intelligence-corp.md": `---\ncompany: Acme Intelligence Corp\nfictional: true\nlastReviewed: 2026-07-24\n---\n`,
      "placeholder-systems.md": `---
company: Placeholder Systems
fictional: true
lastReviewed: 2026-07-24
assessments:
  - principle: article-1
    status: falls-short
    assessment: An uncited claim that must never reach the page.
---
`,
    });
    expect(() => loadAllScorecardEntries(dir)).toThrowError(
      /placeholder-systems/,
    );
    expect(() => loadAllScorecardEntries(dir)).toThrowError(
      /requires at least one citation/,
    );
  });

  it("getScorecardEntry throws rather than silently skipping a bad file", () => {
    const dir = tmpContentDir({
      "placeholder-systems.md": `---\ncompany: Placeholder Systems\nlastReviewed: 2026-07-24\n---\n`,
    });
    expect(() => getScorecardEntry("placeholder-systems", dir)).toThrow();
  });

  it("returns null for a missing entry and for a path-traversal attempt", () => {
    const dir = tmpContentDir({});
    expect(getScorecardEntry("no-such-company", dir)).toBeNull();
    expect(getScorecardEntry("../../../etc/passwd", dir)).toBeNull();
  });
});
