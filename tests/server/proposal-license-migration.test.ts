import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

/**
 * drizzle/0012 is applied by hand (see AGENTS.md), possibly more than once, to
 * a table that already holds proposals submitted with NO licence grant.
 *
 * The property that matters legally: applying it must NOT stamp those rows
 * with a licence. A column DEFAULT on ADD COLUMN backfills every existing row
 * in Postgres, which would silently record a CC BY grant nobody gave.
 */
const MIGRATION = readFileSync(
  join(__dirname, "../../drizzle/0012_proposal_license.sql"),
  "utf8",
);

async function applyMigration(client: PGlite) {
  for (const stmt of MIGRATION.split("--> statement-breakpoint")) {
    if (stmt.replace(/--.*$/gm, "").trim()) await client.exec(stmt);
  }
}

describe("drizzle/0012_proposal_license.sql", () => {
  it("leaves existing proposals with no recorded licence, and re-runs cleanly", async () => {
    const client = new PGlite();
    await client.exec(`
      CREATE TABLE proposed_edits (id serial PRIMARY KEY, new_text text);
      INSERT INTO proposed_edits (new_text) VALUES ('submitted before the notice');
    `);

    await applyMigration(client);
    await applyMigration(client);

    const { rows } = await client.query<{ license: string | null; license_granted_at: Date | null }>(
      `SELECT license, license_granted_at FROM proposed_edits`,
    );
    expect(rows).toEqual([{ license: null, license_granted_at: null }]);

    // And no default quietly stamps rows written by code that never showed it.
    await client.exec(`INSERT INTO proposed_edits (new_text) VALUES ('old code path')`);
    const after = await client.query<{ license: string | null }>(
      `SELECT license FROM proposed_edits ORDER BY id DESC LIMIT 1`,
    );
    expect(after.rows[0].license).toBeNull();
  });
});
