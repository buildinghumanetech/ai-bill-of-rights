/**
 * ONE foreign key: `signers.referred_by_signer_id`, the self-referencing
 * column that records whose share link brought a signer in.
 *
 * Before this suite existed it carried no ON DELETE action, so Postgres
 * defaulted to NO ACTION and every DELETE of an inviter raised SQLSTATE 23503
 * — account deletion and GDPR erasure were broken for exactly the people who
 * had successfully shared the site. None of the three deletion paths cleared
 * the referring rows first, so none of them could recover from it.
 *
 * The fix is ON DELETE SET NULL on the constraint itself (schema.ts, mirrored
 * in drizzle/0008 and in the pglite test DDL). Attribution is a historical
 * fact about how someone arrived, so nulling it is right; CASCADE would delete
 * real signers, which would be catastrophic.
 *
 * These tests therefore assert two things per path: the delete SUCCEEDS, and
 * the referred signer SURVIVES with their attribution nulled.
 *
 * Scope: referrals only. Every OTHER foreign key into `signers.id` is a bare
 * reference cleared by hand in `deleteSigner`'s cascade — endorsements,
 * comments and their votes/reports/mentions, proposals and their upvotes.
 * Those live in signer-deletion.activity.test.ts; a green run here says
 * nothing about them.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import Module from "node:module";
import { createTestDb, type TestDb } from "../_helpers/pglite-db";
import { signers } from "@/lib/db/schema";

/**
 * `me.ts` and `admin.ts` reach for the real Neon client via a lazy
 * `require("@/lib/db")` and read the caller's identity from Clerk, so both are
 * mocked here. `vi.hoisted` is what lets the (hoisted) mock factories read
 * per-test state that is assigned further down.
 */
const state = vi.hoisted(() => ({
  db: null as unknown,
  clerkUserId: null as string | null,
}));

/**
 * `vi.mock("@/lib/db")` alone is not enough: those modules call CommonJS
 * `require("@/lib/db")` (deliberately, to keep the Neon client from being
 * constructed at import time), and CJS resolution knows nothing about Vite's
 * `@` alias or Vitest's module registry — it just throws MODULE_NOT_FOUND.
 * Intercepting `Module._load` is the one hook that sits under `require`, so it
 * catches the call wherever it is made from.
 *
 * Installed in beforeAll, not at import time, so the patch's lifetime is a
 * symmetric hook pair. Installed at import time it would outlive this file
 * whenever collection throws — afterAll never runs, and every later suite in
 * the same worker gets this file's dead pglite back from `require("@/lib/db")`.
 */
const loader = Module as unknown as {
  _load(request: string, parent: unknown, isMain: boolean): unknown;
};
const originalLoad = loader._load;
beforeAll(() => {
  loader._load = function (this: unknown, request, ...rest) {
    if (request === "@/lib/db") return { db: state.db };
    return originalLoad.call(this, request, ...rest);
  } as typeof originalLoad;
});
afterAll(() => {
  loader._load = originalLoad;
});

vi.mock("@/lib/db", () => ({
  get db() {
    return state.db;
  },
}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: state.clerkUserId }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/admin/check", () => ({
  getCurrentAdmin: async () => ({
    state: "admin",
    signer: {
      id: "00000000-0000-4000-8000-00000000adm1",
      clerkUserId: "user_admin",
      displayName: "Admin",
      isAdmin: true,
    },
  }),
}));

let db: TestDb;

beforeEach(async () => {
  // Fresh module registry per test so each action module's cached `_db`
  // points at this test's database rather than the previous test's.
  vi.resetModules();
  db = await createTestDb();
  state.db = db;
  state.clerkUserId = null;
});

async function seedSigner(
  clerkUserId: string,
  referredBySignerId?: string,
): Promise<string> {
  const [row] = await db
    .insert(signers)
    .values({
      clerkUserId,
      displayName: clerkUserId,
      verificationMethod: "email",
      verifiedAt: new Date(),
      referredBySignerId: referredBySignerId ?? null,
    })
    .returning({ id: signers.id });
  return row.id as string;
}

/** An inviter plus the person they brought in. */
async function seedReferralPair() {
  const inviterId = await seedSigner("user_inviter");
  const inviteeId = await seedSigner("user_invitee", inviterId);
  return { inviterId, inviteeId };
}

/** The referred signer must survive, minus their (now dangling) attribution. */
async function expectInviteeSurvivedUnattributed(inviteeId: string) {
  const rows = await db.select().from(signers).where(eq(signers.id, inviteeId));
  expect(rows).toHaveLength(1);
  expect(rows[0].referredBySignerId).toBeNull();
  // ...and they are still a real signature, not a hollowed-out row.
  expect(rows[0].displayName).toBe("user_invitee");
}

/**
 * Role-neutral on purpose: both directions of the referral are deleted
 * somewhere in this suite, so this says only "this id is gone".
 */
async function expectSignerGone(signerId: string) {
  const rows = await db.select().from(signers).where(eq(signers.id, signerId));
  expect(rows).toHaveLength(0);
}

describe("deleting a signer who referred someone", () => {
  it("succeeds via the revoke path (deleteSigner)", async () => {
    const { inviterId, inviteeId } = await seedReferralPair();
    const { deleteSigner } = await import("@/server/actions/revoke");

    await expect(deleteSigner(db, inviterId)).resolves.toBeUndefined();

    await expectSignerGone(inviterId);
    await expectInviteeSurvivedUnattributed(inviteeId);
  });

  it("succeeds via the self-service path (removeMySignature)", async () => {
    const { inviterId, inviteeId } = await seedReferralPair();
    state.clerkUserId = "user_inviter";
    const { removeMySignature } = await import("@/server/actions/me");

    await expect(removeMySignature()).resolves.toEqual({ success: true });

    await expectSignerGone(inviterId);
    await expectInviteeSurvivedUnattributed(inviteeId);
  });

  it("succeeds via the admin path (deleteSignerAction)", async () => {
    const { inviterId, inviteeId } = await seedReferralPair();
    state.clerkUserId = "user_admin";
    const { deleteSignerAction } = await import("@/server/actions/admin");

    await expect(deleteSignerAction(inviterId)).resolves.toBeUndefined();

    await expectSignerGone(inviterId);
    await expectInviteeSurvivedUnattributed(inviteeId);
  });

  it("nulls attribution for every person the deleted signer brought in", async () => {
    // One popular sharer, several invitees: all of them must survive.
    const inviterId = await seedSigner("user_popular");
    const inviteeIds = await Promise.all([
      seedSigner("user_a", inviterId),
      seedSigner("user_b", inviterId),
      seedSigner("user_c", inviterId),
    ]);
    const { deleteSigner } = await import("@/server/actions/revoke");

    await deleteSigner(db, inviterId);

    const remaining = await db.select().from(signers);
    expect(remaining.map((r) => r.id).sort()).toEqual([...inviteeIds].sort());
    expect(remaining.every((r) => r.referredBySignerId === null)).toBe(true);
  });

  it("leaves other people's attribution alone", async () => {
    // Deleting A must not disturb the credit B is owed for bringing in C.
    const doomedId = await seedSigner("user_doomed");
    const otherInviterId = await seedSigner("user_other_inviter");
    const inviteeId = await seedSigner("user_invitee", doomedId);
    const untouchedId = await seedSigner("user_untouched", otherInviterId);
    const { deleteSigner } = await import("@/server/actions/revoke");

    await deleteSigner(db, doomedId);

    await expectInviteeSurvivedUnattributed(inviteeId);
    const [untouched] = await db
      .select()
      .from(signers)
      .where(eq(signers.id, untouchedId));
    expect(untouched.referredBySignerId).toBe(otherInviterId);
  });

  it("still deletes a signer who was themselves referred", async () => {
    // The other direction: the child row going away must not need the parent.
    const { inviterId, inviteeId } = await seedReferralPair();
    const { deleteSigner } = await import("@/server/actions/revoke");

    await deleteSigner(db, inviteeId);

    await expectSignerGone(inviteeId);
    const [inviter] = await db
      .select()
      .from(signers)
      .where(eq(signers.id, inviterId));
    // Not toBeTruthy(): that passes on a row whose columns were mangled by a
    // stray SET NULL. The inviter never referred anyone, so their own
    // attribution stays null, and their identity is untouched.
    expect(inviter.displayName).toBe("user_inviter");
    expect(inviter.referredBySignerId).toBeNull();
  });
});
