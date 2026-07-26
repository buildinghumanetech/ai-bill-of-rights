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
  } catch {
    throw new Error(`Cannot read ${indexPath} — does the file exist?`);
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
  return index as VersionsIndex;
}

export type Restorability =
  | { restorable: true }
  | { restorable: false; reason: string };

/**
 * Could `pnpm sync-versions` put this version back after it is deleted?
 *
 * Only true when it is listed in `versions.json` history AND all three of its
 * files are on disk. Both halves matter: history membership alone lets a
 * version whose markdown was renamed pass, after which the delete succeeds and
 * the follow-up `sync-versions` throws ENOENT before inserting anything —
 * producing exactly the permanent no-current-version state this predicate
 * exists to prevent.
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
