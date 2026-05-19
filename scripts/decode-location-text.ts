/**
 * One-shot data fix: decode percent-encoded characters in signers.location_text.
 *
 * Vercel's x-vercel-ip-city header was being stored as-is, so multi-word city
 * names landed in the DB as "Menlo%20Park, CA, US" etc. This script scans for
 * any row with '%' in location_text and rewrites it to the decoded form.
 *
 * Safe to re-run: rows that don't contain '%' are skipped; rows where
 * decodeURIComponent throws on malformed encoding are left untouched.
 *
 * Usage:
 *   pnpm tsx scripts/decode-location-text.ts          # dev (uses .env.local)
 *   DATABASE_URL=postgres://... pnpm tsx scripts/decode-location-text.ts   # prod
 */
import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";
config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL!);

interface SignerRow {
  id: string;
  display_name: string;
  location_text: string;
}

async function main() {
  const rows = (await sql(`
    SELECT id, display_name, location_text
    FROM signers
    WHERE location_text LIKE '%\\%%' ESCAPE '\\'
  `)) as SignerRow[];

  console.log(`Found ${rows.length} row(s) with percent-encoded location_text`);

  let fixed = 0;
  for (const r of rows) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(r.location_text);
    } catch {
      console.log(`  skip ${r.display_name}: malformed encoding`);
      continue;
    }
    if (decoded === r.location_text) {
      console.log(`  skip ${r.display_name}: nothing to change`);
      continue;
    }
    await sql(
      `UPDATE signers SET location_text = $1 WHERE id = $2`,
      [decoded, r.id],
    );
    console.log(`  ✓ ${r.display_name}: "${r.location_text}" → "${decoded}"`);
    fixed++;
  }
  console.log(`\nFixed ${fixed} row(s).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
