import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";
config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  const cols = await sql(`
    SELECT table_name, column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('selfies', 'selfie_reports')
    ORDER BY table_name, ordinal_position
  `);
  console.log("Columns:");
  for (const c of cols as any[]) {
    console.log(
      `  ${c.table_name}.${c.column_name} (${c.data_type}, null=${c.is_nullable})`,
    );
  }

  const idx = await sql(`
    SELECT tablename, indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename IN ('selfies', 'selfie_reports')
    ORDER BY tablename, indexname
  `);
  console.log("\nIndexes:");
  for (const i of idx as any[]) {
    console.log(`  ${i.tablename}.${i.indexname}`);
    console.log(`    ${i.indexdef}`);
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
