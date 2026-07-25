import { describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../_helpers/pglite-db";
import { upsertSignerProfile } from "@/server/actions/profile";
import { resolveReferrerId } from "@/lib/referral/attribution";
import { signers } from "@/lib/db/schema";

/**
 * Attribution against a real database.
 *
 * The governing rule for this whole feature is ATTRIBUTION MUST NEVER COST US
 * A SIGNATURE, so most of these tests are about the failure paths: a stale ref
 * pointing at a signer who no longer exists, a forged one, someone's own link
 * handed back to them. Every one of those must resolve to an unattributed
 * signature, never a thrown insert.
 *
 * These run through `upsertSignerProfile` rather than calling
 * `resolveReferrerId` directly wherever possible, because the thing that would
 * actually break in production is the INSERT — and `tests/lib/
 * db.signers-referral-columns.test.ts` has already proved the foreign key is
 * live and will reject a dangling id with SQLSTATE 23503.
 */

const NONEXISTENT = "99999999-9999-9999-9999-999999999999";

async function seedSigner(
  db: Awaited<ReturnType<typeof createTestDb>>,
  clerkUserId: string,
) {
  const [row] = await db
    .insert(signers)
    .values({
      clerkUserId,
      displayName: "Seed Signer",
      verificationMethod: "email",
      verifiedAt: new Date(),
    })
    .returning({ id: signers.id });
  return row.id as string;
}

async function readSigner(
  db: Awaited<ReturnType<typeof createTestDb>>,
  clerkUserId: string,
) {
  const rows = await db
    .select()
    .from(signers)
    .where(eq(signers.clerkUserId, clerkUserId));
  return rows[0];
}

const BASE = {
  displayName: "New Signer",
  affiliation: null,
  locationText: null,
  verificationMethod: "email" as const,
};

describe("upsertSignerProfile attribution", () => {
  it("stamps the referrer on INSERT when the ref points at a real signer", async () => {
    const db = await createTestDb();
    const inviterId = await seedSigner(db, "user_inviter");

    await upsertSignerProfile(db, {
      ...BASE,
      clerkUserId: "user_invitee",
      referredBySignerId: inviterId,
    });

    expect((await readSigner(db, "user_invitee")).referredBySignerId).toBe(
      inviterId,
    );
  });

  it("leaves attribution null for an organic signer with no ref", async () => {
    const db = await createTestDb();
    await upsertSignerProfile(db, { ...BASE, clerkUserId: "user_organic" });
    expect((await readSigner(db, "user_organic")).referredBySignerId).toBeNull();
  });

  it("still signs the person when the ref points at a signer who no longer exists", async () => {
    // The failure this whole module exists to prevent: a 30-day-old cookie
    // naming a since-deleted signer. Passing it straight to the INSERT would
    // trip the foreign key and lose the signature.
    const db = await createTestDb();
    await expect(
      upsertSignerProfile(db, {
        ...BASE,
        clerkUserId: "user_stale_ref",
        referredBySignerId: NONEXISTENT,
      }),
    ).resolves.toMatchObject({ id: expect.any(String) });

    const row = await readSigner(db, "user_stale_ref");
    expect(row.referredBySignerId).toBeNull();
    expect(row.displayName).toBe("New Signer");
  });

  it("still signs the person when the ref is malformed", async () => {
    const db = await createTestDb();
    await upsertSignerProfile(db, {
      ...BASE,
      clerkUserId: "user_junk_ref",
      referredBySignerId: "'; drop table signers; --",
    });
    expect((await readSigner(db, "user_junk_ref")).referredBySignerId).toBeNull();
  });

  it("refuses to credit someone for referring themselves", async () => {
    // Sharing your own link and clicking it is not a referral. Without this,
    // the "people you brought in" count is trivially self-inflatable.
    const db = await createTestDb();
    const ownId = await seedSigner(db, "user_self");

    // Simulate the same Clerk user coming back through the sign path with
    // their own signer id in the cookie. The row already exists, so drive the
    // check at the resolver — which is the layer that owns the rule.
    await expect(
      resolveReferrerId(db, { ref: ownId, clerkUserId: "user_self" }),
    ).resolves.toBeNull();

    // And a different user with the same ref is still attributed normally.
    await expect(
      resolveReferrerId(db, { ref: ownId, clerkUserId: "user_other" }),
    ).resolves.toBe(ownId);
  });

  it("writes attribution once and never rewrites it on a later profile edit", async () => {
    // Attribution is a fact about how someone first arrived. A later edit —
    // or a second visit carrying a different ref — must not relabel it.
    const db = await createTestDb();
    const firstInviter = await seedSigner(db, "user_inviter_1");
    const secondInviter = await seedSigner(db, "user_inviter_2");

    await upsertSignerProfile(db, {
      ...BASE,
      clerkUserId: "user_edits",
      referredBySignerId: firstInviter,
    });
    await upsertSignerProfile(db, {
      ...BASE,
      clerkUserId: "user_edits",
      displayName: "Renamed Signer",
      locationText: "Berlin",
      referredBySignerId: secondInviter,
    });

    const row = await readSigner(db, "user_edits");
    expect(row.referredBySignerId).toBe(firstInviter);
    // ...while the rest of the profile did update, proving the update ran.
    expect(row.displayName).toBe("Renamed Signer");
    expect(row.locationText).toBe("Berlin");
  });

  it("does not erase existing attribution when a later edit carries no ref", async () => {
    const db = await createTestDb();
    const inviterId = await seedSigner(db, "user_inviter_3");

    await upsertSignerProfile(db, {
      ...BASE,
      clerkUserId: "user_keeps",
      referredBySignerId: inviterId,
    });
    await upsertSignerProfile(db, { ...BASE, clerkUserId: "user_keeps" });

    expect((await readSigner(db, "user_keeps")).referredBySignerId).toBe(
      inviterId,
    );
  });
});

describe("resolveReferrerId", () => {
  it("rejects every shape that isn't a UUID without touching the database", async () => {
    const db = await createTestDb();
    const select = vi.spyOn(db, "select");
    for (const ref of [null, undefined, "", "abc", 42, {}, [NONEXISTENT]]) {
      await expect(
        resolveReferrerId(db, { ref: ref as string | null | undefined }),
      ).resolves.toBeNull();
    }
    expect(select).not.toHaveBeenCalled();
    select.mockRestore();
  });

  it("swallows a database failure rather than taking the signature down", async () => {
    // The last line of defence: even if the lookup itself blows up, the
    // caller gets null and the signature proceeds unattributed.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const brokenDb = {
      select() {
        throw new Error("connection reset");
      },
    };
    await expect(
      resolveReferrerId(brokenDb, { ref: NONEXISTENT }),
    ).resolves.toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
