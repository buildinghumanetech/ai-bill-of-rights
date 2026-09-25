import type { VersionLevel } from "@/lib/content/versions-index";

export type NotificationPreference = "major" | "minor" | "none";

/**
 * Who hears about a new version, by the preference they chose when signing
 * ("Alert me when the AI Bill of Rights is updated"):
 *
 *  - "major" (the default) hears about major versions only;
 *  - "minor" hears about major and minor versions;
 *  - "none" hears about nothing.
 *
 * The level comes from `level` on the version's entry in
 * content/bill-of-rights/versions.json. The one-time relaunch email counts as
 * a major version.
 */
export function wantsVersionEmail(
  preference: NotificationPreference,
  level: VersionLevel,
): boolean {
  if (preference === "none") return false;
  if (preference === "minor") return true;
  return level === "major";
}
