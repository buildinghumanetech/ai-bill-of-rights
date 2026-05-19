/**
 * Apply a drizzle migration SQL file statement-by-statement, tolerating
 * "already exists" errors. Safe to re-run.
 *
 * Use this when the standard `pnpm drizzle-kit migrate` isn't usable —
 * typically because the DB was originally populated via `drizzle-kit push`
 * (no tracking table) and the schema is partially in place.
 *
 * Usage:
 *   pnpm tsx scripts/apply-migration.ts drizzle/0001_add_comments_and_proposed_edits.sql
 *   pnpm tsx scripts/apply-migration.ts drizzle/0002_add_selfies.sql
 */
import { neon } from "@neondatabase/serverless";
import fs from "node:fs";
import path from "node:path";

const sql = neon(process.env.DATABASE_URL!);

const TOLERATED_PATTERNS = [
  /already exists/i,
  /constraint .* already exists/i,
  /relation .* already exists/i,
  /column .* of relation .* already exists/i,
  /duplicate_table/i,
  /duplicate_object/i,
];

function isTolerable(msg: string): boolean {
  return TOLERATED_PATTERNS.some((p) => p.test(msg));
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: pnpm tsx scripts/apply-migration.ts <path-to-sql>");
    process.exit(2);
  }
  const abs = path.resolve(file);
  if (!fs.existsSync(abs)) {
    console.error(`File not found: ${abs}`);
    process.exit(2);
  }
  const raw = fs.readFileSync(abs, "utf8");

  // Drizzle migration files use --> statement-breakpoint to separate
  // statements. Fall back to splitting on `;\n` for files that don't have
  // the breakpoint comment (e.g. hand-written migrations).
  const breakpoint = "--> statement-breakpoint";
  let stmts: string[];
  if (raw.includes(breakpoint)) {
    stmts = raw.split(breakpoint);
  } else {
    stmts = raw.split(/;\s*\n/);
  }
  stmts = stmts
    .map((s) => s.trim().replace(/;$/, "").trim())
    .filter((s) => s.length > 0 && !/^(--.*\n?)+$/.test(s));

  console.log(`Applying ${file} — ${stmts.length} statement(s)`);

  let applied = 0;
  let skipped = 0;
  for (const s of stmts) {
    const preview = s.replace(/\s+/g, " ").slice(0, 80);
    try {
      await sql(s);
      console.log(`✓ ${preview}…`);
      applied++;
    } catch (e) {
      const msg = (e as Error).message;
      if (isTolerable(msg)) {
        console.log(`= skip (already applied): ${preview}…`);
        skipped++;
      } else {
        console.error(`× ${preview}…`);
        console.error("  ", msg);
        throw e;
      }
    }
  }

  console.log(`\nDone. ${applied} new statement(s) applied, ${skipped} skipped (already applied).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
