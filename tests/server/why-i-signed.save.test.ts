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

/**
 * Hand back the same db with its `update` counted.
 *
 * "This call performed no write" is not observable from the stored value — a
 * removal of an already-empty statement stores exactly what was already there —
 * and `signers` has no updated_at to watch either. So the only way to see it is
 * to watch the call: `saveWhyISignedForClerkUser` reaches the database through
 * `db.select()` and `db.update()` and nothing else, so a proxy over those two
 * is a complete account of what it did.
 */
function countingDb(db: TestDb): { db: TestDb; updates: number } {
  const spy = {
    db: null as unknown as TestDb,
    updates: 0,
  };
  spy.db = new Proxy(db as object, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (prop !== "update") return value;
      return (...args: unknown[]) => {
        spy.updates++;
        return (value as (...a: unknown[]) => unknown).apply(target, args);
      };
    },
  }) as TestDb;
  return spy;
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

  it("never refuses a removal, even with the budget spent", async () => {
    // Taking your own words down is the one thing the account page promises
    // will always work; a limit that blocks it leaves the statement live on a
    // public page and in a shared OG card for up to an hour. The abuse loop is
    // still bounded because re-adding the text is a SET, and SETs are counted.
    const db = await seed();
    for (let i = 0; i < WHY_I_SIGNED_EDITS_PER_HOUR; i++) {
      const res = await saveWhyISignedForClerkUser(db, CLERK_ID, `edit ${i}`);
      expect(res.ok).toBe(true);
    }
    expect(
      await saveWhyISignedForClerkUser(db, CLERK_ID, "one edit too many"),
    ).toMatchObject({ ok: false, reason: "rate_limited" });

    // Budget spent — the removal still lands, and it is a real write.
    const removed = await saveWhyISignedForClerkUser(db, CLERK_ID, "");
    expect(removed).toMatchObject({ ok: true, whyISigned: null, changed: true });
    expect(await storedStatement(db)).toBeNull();

    // ...and it did not buy the signer a way back in: putting text up again is
    // a SET, so it is still refused and the row stays empty.
    expect(
      await saveWhyISignedForClerkUser(db, CLERK_ID, "back up it goes"),
    ).toMatchObject({ ok: false, reason: "rate_limited" });
    expect(await storedStatement(db)).toBeNull();
  });

  it("does not spend an edit slot on a removal", async () => {
    // The other half of "removals are free". Every removal above happens with
    // the budget already spent, so an implementation that COUNTS the removal
    // but skips the refusal check would pass those unchanged — and a signer who
    // made five edits and five removals would silently be down to five edits.
    // Spend the removal first, then check the full budget is still there.
    const db = await seed();
    expect((await saveWhyISignedForClerkUser(db, CLERK_ID, "")).ok).toBe(true);

    for (let i = 0; i < WHY_I_SIGNED_EDITS_PER_HOUR; i++) {
      const res = await saveWhyISignedForClerkUser(db, CLERK_ID, `edit ${i}`);
      expect(res).toMatchObject({ ok: true });
    }
    expect(await storedStatement(db)).toBe(
      `edit ${WHY_I_SIGNED_EDITS_PER_HOUR - 1}`,
    );
  });

  it("makes a removal that removes nothing a no-op — no UPDATE at all", async () => {
    // Removals are exempt from the limit, which is only safe if a removal that
    // changes nothing COSTS nothing: otherwise a signed-in signer can drive an
    // unbounded loop of `UPDATE … RETURNING` plus two `revalidatePath` calls
    // against a row that is already NULL — the cache-thrash vector the limit's
    // own docstring names. So the first removal writes, and every repeat after
    // it must touch the database exactly zero times.
    const db = await seed();
    const spy = countingDb(db);

    const first = await saveWhyISignedForClerkUser(spy.db, CLERK_ID, "");
    expect(first).toMatchObject({ ok: true, whyISigned: null, changed: true });
    expect(spy.updates).toBe(1);
    const signerId = first.ok ? first.signerId : null;

    for (let i = 0; i < WHY_I_SIGNED_EDITS_PER_HOUR + 5; i++) {
      // Empty string and whitespace-only are the same path; both are already
      // satisfied by the NULL sitting in the row.
      const again = await saveWhyISignedForClerkUser(
        spy.db,
        CLERK_ID,
        i % 2 === 0 ? "" : "   \n  ",
      );
      expect(again).toMatchObject({
        ok: true,
        // Still the caller's own row, reported the same way a real write does.
        signerId,
        whyISigned: null,
        // The flag the server action reads to skip its revalidatePath calls.
        changed: false,
      });
    }
    expect(spy.updates).toBe(1);
    expect(await storedStatement(db)).toBeNull();
  });

  it("still writes a removal over a legacy empty-string row", async () => {
    // `normalizeWhyISigned` has always stored SQL NULL for "no statement", but
    // a row written before it existed can hold "". That is not already-empty as
    // far as the rest of the app's null checks are concerned, so the no-op
    // shortcut must not swallow it.
    const db = await seed();
    await db
      .update(signers)
      .set({ whyISigned: "" })
      .where(eq(signers.clerkUserId, CLERK_ID));

    const res = await saveWhyISignedForClerkUser(db, CLERK_ID, "");
    expect(res).toMatchObject({ ok: true, whyISigned: null, changed: true });
    expect(await storedStatement(db)).toBeNull();
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
