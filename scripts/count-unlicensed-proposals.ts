/**
 * READ-ONLY. Counts proposals whose text was submitted with NO licence grant,
 * so someone can decide whether to ask those authors for permission before any
 * of it goes into a published version. Never writes, never contacts anyone.
 *
 * Works before or after drizzle/0012: until the `license` column exists, every
 * row is by definition ungranted.
 *
 *   pnpm tsx scripts/count-unlicensed-proposals.ts
 */
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  const cols = (await sql(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'proposed_edits'
  `)) as { column_name: string }[];
  const has = (c: string) => cols.some((r) => r.column_name === c);

  const licensed = has("license") ? `count(*) FILTER (WHERE license IS NOT NULL)::int` : `0`;
  const hidden = has("hidden_at") ? `count(*) FILTER (WHERE hidden_at IS NOT NULL)::int` : `0`;

  const rows = (await sql(`
    SELECT kind, status,
           count(*)::int AS total,
           ${licensed} AS licensed,
           ${hidden} AS hidden,
           count(DISTINCT proposer_signer_id)::int AS authors
      FROM proposed_edits
     GROUP BY kind, status
     ORDER BY kind, status
  `)) as { kind: string; status: string; total: number; licensed: number; hidden: number; authors: number }[];

  console.log(`0011 applied (title column): ${has("title") ? "yes" : "NO"}`);
  console.log(`0012 applied (license column): ${has("license") ? "yes" : "NO"}\n`);
  console.log("kind            status      total  no-grant  hidden  authors");
  let ungranted = 0;
  for (const r of rows) {
    const none = r.total - r.licensed;
    ungranted += none;
    console.log(
      `${r.kind.padEnd(15)} ${r.status.padEnd(11)} ${String(r.total).padStart(5)}  ${String(none).padStart(8)}  ${String(r.hidden).padStart(6)}  ${String(r.authors).padStart(7)}`,
    );
  }

  const [a] = (await sql(`
    SELECT count(DISTINCT proposer_signer_id)::int AS n FROM proposed_edits
    ${has("license") ? "WHERE license IS NULL" : ""}
  `)) as { n: number }[];
  console.log(`\nProposals with no licence grant: ${ungranted}, from ${a.n} distinct author(s).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
