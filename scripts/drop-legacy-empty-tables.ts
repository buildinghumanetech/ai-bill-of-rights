/**
 * One-shot: drop legacy empty Phase 3 tables that have the wrong schema and
 * are blocking migration 0001 from completing. Safety: verifies each table
 * has 0 rows before dropping; refuses to drop if any row count is > 0.
 *
 * Tables: comments, comment_upvotes, reports.
 * NOT dropped: attestations (has 1 row, owned by separate Phase 2 work).
 *
 * Migration 0001 will then recreate comments + comment_upvotes with the
 * correct (new) schema.
 *
 * Authorized by Drodio at the prompt: option A.
 */
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

const LEGACY_EMPTY = ["reports", "comment_upvotes", "comments"]; // drop order matters: children before parent

async function main() {
  // Final safety: verify every table has 0 rows. Bail if any row count > 0.
  for (const t of LEGACY_EMPTY) {
    const reg = await sql(`SELECT to_regclass($1) AS r`, [`public.${t}`]);
    if (!(reg as any[])[0]?.r) {
      console.log(`= skip ${t}: does not exist`);
      continue;
    }
    const c = await sql(`SELECT count(*)::int AS n FROM "${t}"`);
    const n = (c as any[])[0]?.n ?? 0;
    if (n !== 0) {
      console.error(
        `ABORT: ${t} has ${n} rows. This script only drops EMPTY tables.`,
      );
      process.exit(2);
    }
    console.log(`✓ ${t}: 0 rows (safe to drop)`);
  }

  // All safe. Proceed with drops in FK order.
  for (const t of LEGACY_EMPTY) {
    try {
      await sql(`DROP TABLE IF EXISTS "${t}" CASCADE`);
      console.log(`✓ dropped ${t}`);
    } catch (e) {
      console.error(`× drop ${t}:`, (e as Error).message);
      throw e;
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
