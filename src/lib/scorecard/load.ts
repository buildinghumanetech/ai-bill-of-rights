import fs from "node:fs";
import path from "node:path";
import { parseScorecardEntry, ScorecardValidationError } from "./parse";
import { listPrinciples } from "./principles";
import type { ScorecardEntry } from "./types";

const SCORECARD_DIR = path.join(process.cwd(), "content", "scorecard");

/** Slugs of every committed entry, alphabetical. */
export function listScorecardSlugs(dir: string = SCORECARD_DIR): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md") && f !== "README.md")
    .map((f) => f.replace(/\.md$/, ""))
    .sort();
}

/**
 * Load one entry. Returns null when the file does not exist (so a page can
 * 404), but *throws* when the file exists and is malformed — a scorecard that
 * silently drops an unparseable entry is worse than one that refuses to build.
 */
export function getScorecardEntry(
  slug: string,
  dir: string = SCORECARD_DIR,
): ScorecardEntry | null {
  // Never let a URL segment escape the content directory.
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
  const file = path.join(dir, `${slug}.md`);
  if (!fs.existsSync(file)) return null;
  return parseScorecardEntry(fs.readFileSync(file, "utf-8"), slug, listPrinciples());
}

/**
 * Load every entry. Throws an aggregate error naming each bad file, so one
 * broken entry can't quietly disappear from the published page.
 */
export function loadAllScorecardEntries(
  dir: string = SCORECARD_DIR,
): ScorecardEntry[] {
  const entries: ScorecardEntry[] = [];
  const failures: string[] = [];

  for (const slug of listScorecardSlugs(dir)) {
    try {
      const entry = getScorecardEntry(slug, dir);
      if (entry) entries.push(entry);
    } catch (err) {
      failures.push(
        err instanceof ScorecardValidationError
          ? err.message
          : `${slug}: ${(err as Error).message}`,
      );
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `${failures.length} scorecard entr${failures.length === 1 ? "y is" : "ies are"} invalid:\n\n${failures.join("\n\n")}`,
    );
  }

  return entries.sort((a, b) => a.company.localeCompare(b.company));
}

/** Most recent `lastReviewed` across all entries, or null when empty. */
export function latestReviewDate(entries: ScorecardEntry[]): string | null {
  if (entries.length === 0) return null;
  return entries.reduce(
    (max, e) => (e.lastReviewed > max ? e.lastReviewed : max),
    entries[0].lastReviewed,
  );
}

export { SCORECARD_DIR };
