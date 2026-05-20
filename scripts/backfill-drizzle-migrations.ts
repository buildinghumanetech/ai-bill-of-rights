/**
 * One-time bootstrap for databases that were initially populated via
 * `drizzle-kit push` (no migration tracking). Creates the
 * drizzle.__drizzle_migrations table and inserts a row for each migration
 * already on disk, marking them as applied so `drizzle-kit migrate` knows
 * not to re-run them.
 *
 * Safe to re-run: every step uses IF NOT EXISTS / ON CONFLICT DO NOTHING.
 *
 * After this script, the standard `pnpm drizzle-kit migrate` flow works.
 *
 * Usage:
 *   pnpm tsx scripts/backfill-drizzle-migrations.ts
 *
 * Pointed at whichever DATABASE_URL is in .env.local. Be careful with prod.
 */
import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL!);

interface JournalEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}

interface Journal {
  version: string;
  dialect: string;
  entries: JournalEntry[];
}

function sha256(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

async function main() {
  const journal = JSON.parse(
    fs.readFileSync(path.join("drizzle", "meta", "_journal.json"), "utf8"),
  ) as Journal;

  // 1. Ensure the tracking schema + table exist (matches drizzle-orm's DDL).
  await sql(`CREATE SCHEMA IF NOT EXISTS drizzle`);
  await sql(`
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash TEXT NOT NULL,
      created_at BIGINT
    )
  `);

  // 2. Read what's already tracked.
  const existing = (await sql(
    `SELECT hash FROM drizzle.__drizzle_migrations`,
  )) as Array<{ hash: string }>;
  const existingHashes = new Set(existing.map((r) => r.hash));

  console.log(`Journal entries: ${journal.entries.length}`);
  console.log(`Already-tracked hashes: ${existing.length}`);

  // 3. For each journal entry, compute the SQL hash and insert a row if
  //    that hash isn't already tracked. The drizzle migrator hashes the
  //    raw migration file contents (sha256) — same algorithm here.
  for (const entry of journal.entries) {
    const sqlPath = path.join("drizzle", `${entry.tag}.sql`);
    if (!fs.existsSync(sqlPath)) {
      console.warn(`! missing migration file for ${entry.tag} (${sqlPath})`);
      continue;
    }
    const content = fs.readFileSync(sqlPath, "utf8");
    const hash = sha256(content);
    if (existingHashes.has(hash)) {
      console.log(`= ${entry.tag} already tracked (${hash.slice(0, 12)}…)`);
      continue;
    }
    await sql(
      `INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)`,
      [hash, entry.when],
    );
    console.log(`✓ marked ${entry.tag} as applied (${hash.slice(0, 12)}…)`);
  }

  // 4. Verify final state.
  const after = (await sql(
    `SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at ASC`,
  )) as Array<{ hash: string; created_at: string | number }>;
  console.log(`\nFinal tracked migrations: ${after.length}`);
  for (const row of after) {
    console.log(`  ${row.hash.slice(0, 12)}…  (when=${row.created_at})`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
