/**
 * READ-ONLY inspector. Reports the current state of the configured DB so we
 * can decide what to do BEFORE making any changes. Never writes.
 */
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  const trackingExists = await sql(`
    SELECT to_regclass('drizzle.__drizzle_migrations') AS r
  `);
  console.log("Drizzle migration tracking table:", (trackingExists as any[])[0]?.r ?? null);

  const tables = await sql(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' ORDER BY table_name
  `);
  console.log("\nTables in public schema:");
  for (const t of tables as any[]) console.log(`  ${t.table_name}`);

  const expectedTables = [
    "versions",
    "signers",
    "consent_records",
    "signatures",
    "comments",
    "comment_upvotes",
    "proposed_edits",
    "proposal_upvotes",
    "endorsements",
    "selfies",
    "selfie_reports",
  ];
  const existing = new Set((tables as any[]).map((t) => t.table_name));
  const missing = expectedTables.filter((t) => !existing.has(t));
  console.log("\nMissing vs current schema:", missing.length === 0 ? "none" : missing.join(", "));

  const cols = await sql(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'signers'
    ORDER BY column_name
  `);
  const hasNotifPref = (cols as any[]).some(
    (c) => c.column_name === "notification_preference",
  );
  console.log(`\nsigners.notification_preference column: ${hasNotifPref ? "EXISTS" : "MISSING"}`);

  const encoded = await sql(`
    SELECT id, display_name, location_text
    FROM signers
    WHERE location_text LIKE '%\\%%' ESCAPE '\\'
  `);
  console.log(`\nSigners with %-encoded location_text: ${(encoded as any[]).length}`);
  for (const r of encoded as any[]) {
    console.log(`  ${r.display_name}: ${JSON.stringify(r.location_text)}`);
  }

  const counts = await sql(`
    SELECT
      (SELECT count(*)::int FROM signers) AS signers,
      (SELECT count(*)::int FROM signatures) AS signatures
  `);
  const c = (counts as any[])[0];
  console.log(`\nTotals: ${c.signers} signers, ${c.signatures} signatures`);

  // For each existing legacy table that's also in our schema (comments,
  // comment_upvotes), report row count so we know if there's real data to
  // be careful with.
  for (const t of ["comments", "comment_upvotes", "reports", "attestations"]) {
    if (existing.has(t)) {
      const r = await sql(`SELECT count(*)::int AS n FROM "${t}"`);
      console.log(`\n${t} row count: ${(r as any[])[0]?.n}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
