/**
 * READ-ONLY: inspect the prod attestations table state before applying
 * migration 0003. Reports column shape, FK constraint presence, and
 * row contents.
 */
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  const reg = await sql(`SELECT to_regclass('public.attestations') AS r`);
  console.log("attestations table:", (reg as any[])[0]?.r ?? "(none)");

  const cols = await sql(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'attestations'
    ORDER BY ordinal_position
  `);
  console.log("\nColumns:");
  for (const c of cols as any[]) {
    console.log(`  ${c.column_name} (${c.data_type}, null=${c.is_nullable})`);
  }

  const fks = await sql(`
    SELECT conname, pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE conrelid = 'public.attestations'::regclass AND contype = 'f'
  `);
  console.log("\nForeign keys:");
  for (const f of fks as any[]) {
    console.log(`  ${f.conname}: ${f.def}`);
  }

  const idx = await sql(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'attestations'
  `);
  console.log("\nIndexes:");
  for (const i of idx as any[]) {
    console.log(`  ${i.indexname}: ${i.indexdef}`);
  }

  const rows = await sql(`
    SELECT id, org_name, product_name, contact_email, published, hidden_at, claimed_at
    FROM attestations ORDER BY claimed_at ASC
  `);
  console.log(`\nRows: ${(rows as any[]).length}`);
  for (const r of rows as any[]) {
    console.log(`  ${r.org_name} / ${r.product_name} (published=${r.published}, contact=${r.contact_email})`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
