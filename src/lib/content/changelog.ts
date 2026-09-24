import versionsIndex from "../../../content/bill-of-rights/versions.json";

type HistoryEntry = { version: string; changelog?: string | null };

/**
 * The one-paragraph changelog `versions.json` records for `version`, or null
 * when there is nothing to say "what changed" about: an unknown version, a
 * blank entry, or the first version (it has nothing to have changed from).
 *
 * A static import rather than `readVersionsIndex()`: that reads the file at
 * request time from `process.cwd()`, and nothing guarantees `content/` is
 * traced into the serverless bundle. The import is bundled.
 */
export function changelogFor(version: string): string | null {
  const history = versionsIndex.history as HistoryEntry[];
  const i = history.findIndex((h) => h.version === version);
  if (i <= 0) return null;
  const text = history[i].changelog?.trim();
  return text ? text : null;
}
