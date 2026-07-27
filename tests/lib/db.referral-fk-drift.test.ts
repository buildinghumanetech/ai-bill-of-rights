import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { getTableConfig } from "drizzle-orm/pg-core";
import { signers } from "@/lib/db/schema";

/**
 * There are two descriptions of the signers table in this repo, and only one of
 * them reaches production:
 *
 *   - `src/lib/db/schema.ts`      — what `drizzle-kit push` applies to Neon.
 *   - `tests/_helpers/pglite-db.ts` — hand-written DDL the test database uses.
 *
 * `tests/server/signer-deletion.referrals.test.ts` proves that deleting a
 * signer who referred someone works — but it proves it against the *test* DDL.
 * Drop `on delete set null` from schema.ts alone and that suite stays green
 * while production regresses to the foreign-key violation (SQLSTATE 23503)
 * that broke account deletion in the first place.
 *
 * So this test asserts the two agree on the one clause that matters.
 */

describe("referral foreign key: schema.ts vs. the test database", () => {
  it("declares ON DELETE SET NULL in schema.ts, which is what ships", () => {
    const { foreignKeys } = getTableConfig(signers);
    const referralFk = foreignKeys.find((fk) =>
      fk.reference().columns.some((c) => c.name === "referred_by_signer_id"),
    );

    expect(referralFk).toBeDefined();
    // NO ACTION (the drizzle default) is exactly the bug: Postgres refuses to
    // delete any signer who has referred someone.
    expect(referralFk!.onDelete).toBe("set null");
  });

  it("mirrors that clause in the DDL the test database is built from", () => {
    // Guards the inverse drift: a test DDL that is quietly more permissive
    // than production would make the deletion suite pass for the wrong reason.
    const ddl = readFileSync(
      new URL("../_helpers/pglite-db.ts", import.meta.url),
      "utf8",
    );
    expect(ddl).toMatch(
      /referred_by_signer_id\s+uuid\s+references\s+signers\(id\)\s+on\s+delete\s+set\s+null/i,
    );
  });
});
