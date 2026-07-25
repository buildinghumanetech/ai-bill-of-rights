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

  const report = await unsyncVersion(db, versionString, {
    dryRun: !confirmed,
    allowCurrent,
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

  if (report.refusedBecause === "dry run") {
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
