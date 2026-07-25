import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../_helpers/pglite-db";
import { signers } from "@/lib/db/schema";

/**
 * Pins the DB-level behaviour of the two columns added for the growth work.
 *
 * The test DDL in `tests/_helpers/pglite-db.ts` is hand-mirrored from
 * `schema.ts`, so nothing catches a *mismatch* between them unless something
 * actually exercises the columns. These tests are that something — in
 * particular they pin the self-FK on `referred_by_signer_id`, which is the
 * guard that stops a stale `?ref=` in a visitor's cookie from being written
 * as a dangling reference.
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
