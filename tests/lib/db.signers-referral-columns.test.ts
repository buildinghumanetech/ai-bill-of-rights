import { describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { createTestDb } from "../_helpers/pglite-db";
import { signers } from "@/lib/db/schema";

/**
 * Pins the DB-level behaviour of the two columns added for the growth work.
 *
 * `createTestDb()` builds its database from `src/lib/db/schema.ts` — the same
 * file `drizzle-kit push` applies to Neon — so everything asserted here is
 * asserted against what actually ships. In particular the self-FK on
 * `referred_by_signer_id` is pinned twice over: once for the rejection that
 * stops a stale `?ref=` in a visitor's cookie becoming a dangling reference,
 * and once for the `ON DELETE SET NULL` that keeps account deletion working
 * for people who referred someone.
 */

async function insertSigner(
  db: Awaited<ReturnType<typeof createTestDb>>,
  overrides: Partial<typeof signers.$inferInsert> & { clerkUserId: string },
) {
  const [row] = await db
    .insert(signers)
    .values({
      displayName: "Test Signer",
      verificationMethod: "email",
      verifiedAt: new Date(),
      ...overrides,
    })
    .returning();
  return row;
}

describe("signers.whyISigned", () => {
  it("round-trips a statement", async () => {
    const db = await createTestDb();
    const row = await insertSigner(db, {
      clerkUserId: "user_why_1",
      whyISigned: "Because my kids will grow up with this technology.",
    });
    expect(row.whyISigned).toBe(
      "Because my kids will grow up with this technology.",
    );
  });

  it("defaults to null when not provided", async () => {
    const db = await createTestDb();
    const row = await insertSigner(db, { clerkUserId: "user_why_2" });
    expect(row.whyISigned).toBeNull();
  });

  it("accepts unicode and punctuation without mangling", async () => {
    const db = await createTestDb();
    const text = "«Nous méritons mieux» — 我们值得更好 🌍";
    const row = await insertSigner(db, {
      clerkUserId: "user_why_3",
      whyISigned: text,
    });
    expect(row.whyISigned).toBe(text);
  });
});

describe("signers.referredBySignerId", () => {
  it("records a valid referrer", async () => {
    const db = await createTestDb();
    const inviter = await insertSigner(db, { clerkUserId: "user_ref_a" });
    const invitee = await insertSigner(db, {
      clerkUserId: "user_ref_b",
      referredBySignerId: inviter.id,
    });
    expect(invitee.referredBySignerId).toBe(inviter.id);
  });

  it("defaults to null for an organic signer", async () => {
    const db = await createTestDb();
    const row = await insertSigner(db, { clerkUserId: "user_ref_c" });
    expect(row.referredBySignerId).toBeNull();
  });

  it("rejects a referrer id that does not exist, via the foreign key", async () => {
    // This is the important one: a stale or forged ?ref= must not be
    // insertable. Whatever writes attribution has to tolerate this rejection
    // without failing the signature itself.
    //
    // Asserting the SQLSTATE rather than just "it threw": a bare toThrow()
    // would also pass if the column were renamed, if a NOT NULL were added,
    // or if pglite failed to connect — i.e. it would stay green in exactly
    // the cases where the FK had silently stopped existing.
    const db = await createTestDb();
    let code: string | undefined;
    try {
      await insertSigner(db, {
        clerkUserId: "user_ref_d",
        referredBySignerId: "99999999-9999-9999-9999-999999999999",
      });
    } catch (err) {
      code = (err as { code?: string }).code;
    }
    // 23503 = foreign_key_violation
    expect(code).toBe("23503");
  });

  it("supports counting how many people a signer brought in", async () => {
    const db = await createTestDb();
    const inviter = await insertSigner(db, { clerkUserId: "user_ref_e" });
    await insertSigner(db, {
      clerkUserId: "user_ref_f",
      referredBySignerId: inviter.id,
    });
    await insertSigner(db, {
      clerkUserId: "user_ref_g",
      referredBySignerId: inviter.id,
    });
    await insertSigner(db, { clerkUserId: "user_ref_h" });

    const referred = await db
      .select()
      .from(signers)
      .where(eq(signers.referredBySignerId, inviter.id));
    expect(referred).toHaveLength(2);
  });
});

describe("signers.referred_by_signer_id foreign key", () => {
  /**
   * `ON DELETE SET NULL` here is load-bearing: without it Postgres refuses
   * (SQLSTATE 23503) to delete any signer who ever referred someone, and all
   * three deletion paths — self-service, revoke, admin delete — break for
   * exactly the people who successfully shared the site.
   *
   * Asserted against the live catalog rather than drizzle's in-memory table
   * metadata, because the catalog is what the database will actually obey.
   */
  it("is SET NULL on delete, and points at signers.id", async () => {
    const db = await createTestDb();
    const result = await db.execute(sql`
      select
        con.conname,
        con.confdeltype,
        tgt.relname as target_table,
        att.attname  as target_column
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace nsp on nsp.oid = rel.relnamespace
      join pg_class tgt on tgt.oid = con.confrelid
      join pg_attribute att
        on att.attrelid = con.confrelid and att.attnum = con.confkey[1]
      where con.contype = 'f'
        and nsp.nspname = 'public'
        and rel.relname = 'signers'
        and con.conkey = array[(
          select attnum from pg_attribute
          where attrelid = rel.oid and attname = 'referred_by_signer_id'
        )]::smallint[]
    `);
    const rows = result.rows as Array<{
      confdeltype: string;
      target_table: string;
      target_column: string;
    }>;

    // Exactly one: two FKs on the column would mean a migration left a stale
    // constraint behind, and "the first one we happened to find is correct"
    // is not a guarantee worth having.
    expect(rows).toHaveLength(1);
    // 'n' = SET NULL. 'a' (NO ACTION, drizzle's default) is precisely the bug.
    expect(rows[0].confdeltype).toBe("n");
    // A regression that repointed the column at some other table would keep
    // SET NULL and still be catastrophically wrong.
    expect(rows[0].target_table).toBe("signers");
    expect(rows[0].target_column).toBe("id");
  });
});
