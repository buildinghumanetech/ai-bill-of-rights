import { getCurrentVersion } from "@/lib/db/queries";

export interface HomepageTabData {
  currentVersion: string;
  proposedVersion: string;
  baseVersionId: string | null;
}

function bumpPatch(version: string): string {
  const parts = version.split(".");
  if (parts.length < 3) return version;
  const patch = parseInt(parts[2] ?? "0", 10);
  return `${parts[0]}.${parts[1]}.${patch + 1}`;
}

/**
 * Resolves the data both Current and Proposed tabs need at request time so
 * `<TabbedDocument>` can render either initial tab without further fetching.
 * Returns sensible defaults when the DB is unreachable (preview/test builds).
 */
export async function loadHomepageTabData(): Promise<HomepageTabData> {
  const current = await getCurrentVersion().catch(() => null);
  const currentVersion = current?.version ?? "0.0.1";
  const proposedVersion = bumpPatch(currentVersion);
  return {
    currentVersion,
    proposedVersion,
    baseVersionId: current?.id ?? null,
  };
}
