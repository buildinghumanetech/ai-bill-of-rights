import fs from "node:fs";
import path from "node:path";

/**
 * Where the published bill-of-rights content lives. `sync-versions` reads every
 * version's three files from here, so it is also the answer to "could this
 * version be restored from disk".
 */
export const CONTENT_ROOT = path.join(process.cwd(), "content/bill-of-rights");

export interface VersionsIndexEntry {
  version: string;
  published_at: string;
}

export interface VersionsIndex {
  current: string;
  history: VersionsIndexEntry[];
}

/**
 * The three files `sync-versions` reads per history entry. Restoring a version
 * needs all of them, so a check that looks only at `versions.json` membership
 * is not a check that the version can actually come back.
 */
export function versionFileNames(version: string): string[] {
  return [`v${version}.md`, `v${version}.agents.md`, `v${version}.spec.json`];
}

/**
 * Read and validate `versions.json`. Throws with the path and the actual
 * problem rather than letting a raw ENOENT or a `TypeError: … is not iterable`
 * surface from somewhere three frames deeper.
 */
export function readVersionsIndex(root: string = CONTENT_ROOT): VersionsIndex {
  const indexPath = path.join(root, "versions.json");
  let raw: string;
  try {
    raw = fs.readFileSync(indexPath, "utf-8");
  } catch (err) {
    // Keep the cause. A bare "does the file exist?" sends an operator hunting
    // for a file that is sitting right there when the real problem is EACCES
    // or EISDIR, and the discarded error was the only thing that knew.
    const code = (err as NodeJS.ErrnoException)?.code;
    const detail = code ?? (err instanceof Error ? err.message : String(err));
    throw new Error(`Cannot read ${indexPath} (${detail})`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`${indexPath} is not valid JSON: ${detail}`);
  }

  const index = parsed as Partial<VersionsIndex>;
  if (typeof index?.current !== "string" || !Array.isArray(index?.history)) {
    throw new Error(
      `${indexPath} must be an object with a string "current" and an array "history"`,
    );
  }

  // Validate every ENTRY, not just that history is an array. A `[null]` or a
  // bare string after a hand-edit would otherwise throw a raw
  // "Cannot read properties of null" from whichever caller scanned it first —
  // precisely the three-frames-deeper failure this reader exists to prevent.
  index.history.forEach((entry, i) => {
    if (typeof (entry as VersionsIndexEntry)?.version !== "string") {
      throw new Error(
        `${indexPath}: history[${i}] must be an object with a string "version"`,
      );
    }
  });

  // `sync-versions` sets is_current purely from `entry.version === current`
  // (scripts/sync-versions.ts). If `current` matches no history entry — a typo,
  // or `current` bumped before its history entry was added — syncVersions
  // clears is_current on every version and leaves NO current row at all. That
  // is unrecoverable-by-re-sync, so it must not read as a well-formed index.
  if (!index.history.some((h) => h.version === index.current)) {
    throw new Error(
      `${indexPath}: current is "${index.current}" but no history entry has that version, so a sync would leave no current version`,
    );
  }

  return index as VersionsIndex;
}

export type Restorability =
  | { restorable: true }
  | { restorable: false; reason: string };

/**
 * Could `pnpm sync-versions` put this version back **as the current version**
 * after it is deleted?
 *
 * The question is deliberately about the CURRENT row, not merely the row: this
 * predicate guards a delete whose advertised remedy is "re-sync and the current
 * version comes back". Three things must hold, and each covers a way the delete
 * turns permanent:
 *
 * - listed in `versions.json` history — otherwise nothing seeds it at all;
 * - all three files on disk — `sync-versions` reads `v<x>.md`, `v<x>.agents.md`
 *   and `v<x>.spec.json` per entry, so a renamed markdown means the re-sync
 *   throws ENOENT before inserting anything;
 * - named as `current` — `sync-versions` derives is_current solely from
 *   `entry.version === index.current`, so re-syncing a version the index does
 *   not call current brings the row back with `is_current = false`.
 *
 * The index-level "current must exist in history" check lives in
 * `readVersionsIndex`, and an unreadable index reports as not-restorable here
 * rather than throwing: the caller is deciding whether a delete is safe, and
 * "I could not tell" must never read as "yes".
 */
export function versionRestorability(
  version: string,
  root: string = CONTENT_ROOT,
): Restorability {
  let index: VersionsIndex;
  try {
    index = readVersionsIndex(root);
  } catch (err) {
    return {
      restorable: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }

  if (!index.history.some((h) => h.version === version)) {
    return {
      restorable: false,
      reason: `${version} is not in ${path.join(root, "versions.json")} history, so nothing on disk would restore it`,
    };
  }

  if (index.current !== version) {
    return {
      restorable: false,
      reason: `${path.join(root, "versions.json")} names "${index.current}" as current, not ${version}, so a re-sync would restore ${version} with is_current = false and make ${index.current} current instead`,
    };
  }

  const missing = versionFileNames(version).filter(
    (name) => !fs.existsSync(path.join(root, name)),
  );
  if (missing.length > 0) {
    return {
      restorable: false,
      reason: `${version} is in versions.json history but ${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} missing from ${root}, so \`pnpm sync-versions\` would throw before re-inserting it`,
    };
  }

  return { restorable: true };
}
