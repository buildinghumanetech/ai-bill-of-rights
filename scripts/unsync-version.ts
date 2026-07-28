/**
 * Delete an UNUSED version row so the next `sync-versions` re-inserts it from
 * the files on disk.
 *
 * Use this when you have edited a version's markdown AFTER a deploy already
 * synced it, and builds now fail with:
 *
 *   Error: Version X.Y.Z hash mismatch: existing … vs new …
 *
 * Refuses outright to touch a version anything references (signatures,
 * comments, proposed edits, endorsements, attestations, child versions).
 *
 * Also refuses a version marked current, unless you pass --allow-current. You
 * usually WILL need that flag: `sync-versions` marks the version named by
 * `versions.json`'s `current` as current, so the draft you are trying to clear
 * is normally the current one. It is safe when nothing references the version
 * — that combination is exactly a frozen draft — but it leaves the database
 * with no current version until you re-sync, so run `pnpm sync-versions`
 * immediately afterwards.
 *
 * --allow-current is honoured only when the version could actually come back:
 * listed in `versions.json` history AND all three of its files present. If not,
 * the delete is refused, because "no current version" would be permanent.
 *
 * Prints a dry run by default — pass --yes to actually delete.
 *
 * Usage:
 *   pnpm tsx scripts/unsync-version.ts 0.1.0
 *   pnpm tsx scripts/unsync-version.ts 0.1.0 --allow-current
 *   pnpm tsx scripts/unsync-version.ts 0.1.0 --allow-current --yes
 *   pnpm sync-versions        # re-insert it from disk, restoring `current`
 *
 * Connects via DATABASE_URL from .env.local — which per the README points at
 * the `dev` Neon branch. Check it before running against anything else.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

// Static, unlike `@/lib/db` below: the dynamic imports in this file exist only
// so dotenv populates process.env before the db module evaluates its
// DATABASE_URL guard. This module reads no env.
import { versionRestorability } from "@/lib/content/versions-index";

async function main(): Promise<void> {
  const versionString = process.argv[2];
  const confirmed = process.argv.includes("--yes");
  const allowCurrent = process.argv.includes("--allow-current");
  if (!versionString) {
    console.error(
      "Usage: pnpm tsx scripts/unsync-version.ts <version> [--allow-current] [--yes]",
    );
    process.exit(2);
  }

  const { db } = await import("@/lib/db");
  const { unsyncVersion } = await import("@/lib/db/unsync-version");

  // Deleting the CURRENT row is only recoverable if `sync-versions` will put it
  // back, so unsyncVersion consults this before honouring --allow-current. It
  // is checked there, against the row's real `is_current`, rather than here
  // against the flag: a NON-current stale leftover absent from disk is exactly
  // the cleanup this tool exists for, and gating on the flag would make it
  // undeletable for anyone following the README — which tells operators they
  // will almost always need --allow-current.
  const report = await unsyncVersion(db, versionString, {
    dryRun: !confirmed,
    allowCurrent,
    isRestorable: versionRestorability,
  });

  if (!report.found) {
    console.log(`No row for version ${versionString} — nothing to do.`);
    return;
  }

  console.log(`Version ${report.version}`);
  console.log(`  is_current: ${report.isCurrent}`);
  console.log("  referenced by:");
  for (const [table, n] of Object.entries(report.dependents)) {
    console.log(`    ${table}: ${n}`);
  }

  if (report.deleted) {
    console.log(
      `\nDeleted. The next \`pnpm sync-versions\` (or deploy) will re-insert ${report.version} from the files on disk.`,
    );
    if (report.isCurrent) {
      console.log(
        "\n⚠️  That was the CURRENT version — the database has no current version\n" +
          "    right now, and pages that read it will not render. Run this next:\n\n" +
          "      pnpm sync-versions\n",
      );
    }
    return;
  }

  // Branch on the CODE, never the message. refusedBecause is display text; a
  // reword of it must not turn a successful dry run into an error exit.
  if (report.refusedCode === "dry_run") {
    if (report.isCurrent) {
      console.log(
        "\n⚠️  This is the CURRENT version. Deleting it leaves the database with\n" +
          "    no current version, and pages that read it will not render until you\n" +
          "    re-sync. Plan to run both commands back to back:\n\n" +
          `      pnpm tsx scripts/unsync-version.ts ${report.version} --allow-current --yes\n` +
          "      pnpm sync-versions\n",
      );
    }
    console.log("\nDry run — safe to delete. Re-run with --yes to do it.");
    process.exit(0);
  }

  console.error(`\nRefused: ${report.refusedBecause}`);
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
