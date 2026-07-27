/**
 * Editing and removing "why I signed" from the account page.
 *
 * The statement is public — signer page, OG card, share copy — so the write
 * path has to sanitise on the way in and has to be rate limited: without a
 * limit, a signer can post something vile, wait for it to be shared, and swap
 * it back, while thrashing every cached OG image on the way past.
 *
 * These drive `saveWhyISignedForClerkUser`, the db-taking core the "use server"
 * action wraps, so they can run against pglite the way the other server tests
 * do (see tests/server/profile.test.ts).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "../_helpers/pglite-db";
import { signers } from "@/lib/db/schema";
import { resetEphemeralRateLimits } from "@/lib/ratelimit/enforce";
import {
  WHY_I_SIGNED_EDITS_PER_HOUR,
  saveWhyISignedForClerkUser,
} from "@/lib/why-i-signed.server";
import { MAX_WHY_I_SIGNED_LENGTH } from "@/lib/why-i-signed";

const CLERK_ID = "user_why_test";

async function seed(): Promise<TestDb> {
  const db = await createTestDb();
  await db.insert(signers).values({
    clerkUserId: CLERK_ID,
    displayName: "Alexandra Petrova-Whitfield",
    affiliation: null,
    locationText: null,
    verificationMethod: "email",
    verifiedAt: new Date(),
    whyISigned: "The statement I wrote when I signed.",
  });
  return db;
}

async function storedStatement(db: TestDb): Promise<string | null> {
  const rows = await db
    .select({ whyISigned: signers.whyISigned })
    .from(signers)
    .where(eq(signers.clerkUserId, CLERK_ID));
  return rows[0].whyISigned;
}

describe("saveWhyISignedForClerkUser — happy path", () => {
  beforeEach(() => resetEphemeralRateLimits());

  it("replaces an existing statement", async () => {
    const db = await seed();
    const res = await saveWhyISignedForClerkUser(
      db,
      CLERK_ID,
      "Actually, I signed for my students.",
    );
    expect(res.ok).toBe(true);
    expect(await storedStatement(db)).toBe(
      "Actually, I signed for my students.",
    );
  });

  it("clears the statement when handed an empty string", async () => {
    // This is the "remove" button on the account page: the sanitiser turns ""
    // into null so the public page falls back to its no-statement branch
    // rather than rendering an empty quote panel.
    const db = await seed();
    const res = await saveWhyISignedForClerkUser(db, CLERK_ID, "");
    expect(res.ok).toBe(true);
    expect(await storedStatement(db)).toBeNull();
  });

  it("clears the statement for whitespace-only input too", async () => {
    const db = await seed();
    await saveWhyISignedForClerkUser(db, CLERK_ID, "   \n  ");
    expect(await storedStatement(db)).toBeNull();
  });

  it("applies the sanitiser on the way in", async () => {
    const db = await seed();
    await saveWhyISignedForClerkUser(
      db,
      CLERK_ID,
      "  multiple\n\nlines   and\tspaces  ",
    );
    expect(await storedStatement(db)).toBe("multiple lines and spaces");
  });

  it("clamps an over-long edit to the cap", async () => {
    const db = await seed();
    await saveWhyISignedForClerkUser(db, CLERK_ID, "x".repeat(5000));
    const stored = await storedStatement(db);
    expect(stored).toHaveLength(MAX_WHY_I_SIGNED_LENGTH);
  });

  it("refuses to write for a Clerk user with no signer row", async () => {
    const db = await seed();
    const res = await saveWhyISignedForClerkUser(db, "user_nobody", "hello");
    expect(res).toMatchObject({ ok: false, reason: "no_signer" });
    // ...and did not touch anyone else's row.
    expect(await storedStatement(db)).toBe(
      "The statement I wrote when I signed.",
    );
  });
});

describe("saveWhyISignedForClerkUser — rate limited", () => {
  beforeEach(() => resetEphemeralRateLimits());

  it("allows the budgeted number of edits in the window, then refuses", async () => {
    const db = await seed();

    for (let i = 0; i < WHY_I_SIGNED_EDITS_PER_HOUR; i++) {
      const res = await saveWhyISignedForClerkUser(db, CLERK_ID, `edit ${i}`);
      expect(res.ok).toBe(true);
    }

    const refused = await saveWhyISignedForClerkUser(
      db,
      CLERK_ID,
      "one edit too many",
    );
    expect(refused).toMatchObject({ ok: false, reason: "rate_limited" });
    expect((refused as { error: string }).error).toMatch(/too many times/i);
  });

  it("leaves the stored statement untouched when it refuses", async () => {
    const db = await seed();
    for (let i = 0; i < WHY_I_SIGNED_EDITS_PER_HOUR; i++) {
      await saveWhyISignedForClerkUser(db, CLERK_ID, `edit ${i}`);
    }
    const last = `edit ${WHY_I_SIGNED_EDITS_PER_HOUR - 1}`;

    await saveWhyISignedForClerkUser(db, CLERK_ID, "should not land");
    expect(await storedStatement(db)).toBe(last);

    // A refused attempt must not extend the lockout either — retrying in a
    // loop should not be able to keep the window permanently full.
    await saveWhyISignedForClerkUser(db, CLERK_ID, "still should not land");
    expect(await storedStatement(db)).toBe(last);
  });

  it("limits the removal path as well as the edit path", async () => {
    // Otherwise the loop is just save/remove/save/remove.
    const db = await seed();
    for (let i = 0; i < WHY_I_SIGNED_EDITS_PER_HOUR; i++) {
      await saveWhyISignedForClerkUser(db, CLERK_ID, i % 2 === 0 ? "on" : "");
    }
    const refused = await saveWhyISignedForClerkUser(db, CLERK_ID, "");
    expect(refused).toMatchObject({ ok: false, reason: "rate_limited" });
  });

  it("counts per signer, not globally", async () => {
    const db = await seed();
    await db.insert(signers).values({
      clerkUserId: "user_someone_else",
      displayName: "Someone Else",
      affiliation: null,
      locationText: null,
      verificationMethod: "email",
      verifiedAt: new Date(),
    });

    for (let i = 0; i < WHY_I_SIGNED_EDITS_PER_HOUR; i++) {
      await saveWhyISignedForClerkUser(db, CLERK_ID, `edit ${i}`);
    }
    expect(
      await saveWhyISignedForClerkUser(db, CLERK_ID, "blocked"),
    ).toMatchObject({ ok: false, reason: "rate_limited" });

    // The other signer's budget is their own.
    const other = await saveWhyISignedForClerkUser(
      db,
      "user_someone_else",
      "my own first edit",
    );
    expect(other.ok).toBe(true);
  });
});
