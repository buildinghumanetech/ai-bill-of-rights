/**
 * What `saveWhyISigned` invalidates, and when.
 *
 * Removing a statement is deliberately exempt from the ten-edits-an-hour limit
 * — someone who regrets a public sentence must be able to take it down now, not
 * in an hour. That exemption is only safe if a removal that removes nothing is
 * genuinely free, and the write is only half of "free": the action also busts
 * two cached routes per call. Unbounded, that is the cache-thrash vector the
 * limit exists to close, driven through the one path with no ceiling on it.
 *
 * So this pins the pairing. A call that changed the row revalidates the
 * signer's public page and the account page. A call that changed nothing
 * revalidates neither, however many times it is repeated.
 */

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import Module from "node:module";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "../_helpers/pglite-db";
import { signers } from "@/lib/db/schema";
import { resetEphemeralRateLimits } from "@/lib/ratelimit/enforce";
import { WHY_I_SIGNED_EDITS_PER_HOUR } from "@/lib/why-i-signed.server";

/** Shared with the hoisted mock factories below; reassigned per test. */
const state = vi.hoisted(() => ({
  db: null as unknown,
  clerkUserId: null as string | null,
  revalidated: [] as string[],
}));

const loader = Module as unknown as {
  _load(request: string, parent: unknown, isMain: boolean): unknown;
};
const originalLoad = loader._load;

/**
 * The action reaches the Neon client through a CommonJS `require("@/lib/db")`
 * (deliberately, to keep the client from being built at import time), and CJS
 * resolution knows nothing about Vite's `@` alias — `vi.mock` alone leaves it
 * throwing MODULE_NOT_FOUND. Same patch, and the same reasoning, as
 * tests/server/signer-deletion.activity.test.ts.
 */
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
vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => {
    state.revalidated.push(path);
  },
}));

const CLERK_ID = "user_why_revalidate";

let db: TestDb;
let signerId: string;

/** Fresh module registry per test so the action's cached `_db` is this test's. */
async function loadAction() {
  vi.resetModules();
  const mod = await import("@/server/actions/why-i-signed");
  return mod.saveWhyISigned;
}

beforeEach(async () => {
  resetEphemeralRateLimits();
  db = await createTestDb();
  state.db = db;
  state.clerkUserId = CLERK_ID;
  state.revalidated = [];
  const [row] = await db
    .insert(signers)
    .values({
      clerkUserId: CLERK_ID,
      displayName: "Alexandra Petrova-Whitfield",
      affiliation: null,
      locationText: null,
      verificationMethod: "email",
      verifiedAt: new Date(),
      whyISigned: "The statement I wrote when I signed.",
    })
    .returning({ id: signers.id });
  signerId = row.id as string;
});

async function storedStatement(): Promise<string | null> {
  const rows = await db
    .select({ whyISigned: signers.whyISigned })
    .from(signers)
    .where(eq(signers.clerkUserId, CLERK_ID));
  return rows[0].whyISigned;
}

describe("saveWhyISigned — cache invalidation", () => {
  it("revalidates both public surfaces when the statement changes", async () => {
    const saveWhyISigned = await loadAction();
    const res = await saveWhyISigned("Actually, I signed for my students.");
    expect(res.success).toBe(true);
    expect(state.revalidated).toEqual([`/signatories/${signerId}`, "/account"]);
  });

  it("revalidates on the first removal — the words really are coming down", async () => {
    const saveWhyISigned = await loadAction();
    const res = await saveWhyISigned("");
    expect(res).toMatchObject({ success: true, whyISigned: null });
    expect(state.revalidated).toEqual([`/signatories/${signerId}`, "/account"]);
    expect(await storedStatement()).toBeNull();
  });

  it("revalidates nothing when a removal removes nothing", async () => {
    const saveWhyISigned = await loadAction();
    await saveWhyISigned("");
    state.revalidated = [];

    // The loop the rate limit used to bound. It reports success every time —
    // the caller asked for an empty statement and has one — but it must not
    // buy a single cache invalidation, let alone two per call.
    for (let i = 0; i < WHY_I_SIGNED_EDITS_PER_HOUR + 5; i++) {
      const res = await saveWhyISigned(i % 2 === 0 ? "" : "   \n  ");
      expect(res).toMatchObject({ success: true, whyISigned: null });
    }
    expect(state.revalidated).toEqual([]);
  });

  it("revalidates nothing when it refuses a rate-limited edit", async () => {
    const saveWhyISigned = await loadAction();
    for (let i = 0; i < WHY_I_SIGNED_EDITS_PER_HOUR; i++) {
      expect((await saveWhyISigned(`edit ${i}`)).success).toBe(true);
    }
    state.revalidated = [];

    const refused = await saveWhyISigned("one edit too many");
    expect(refused.success).toBe(false);
    expect(state.revalidated).toEqual([]);
  });

  it("refuses a caller with no session at all", async () => {
    state.clerkUserId = null;
    const saveWhyISigned = await loadAction();
    expect(await saveWhyISigned("hello")).toMatchObject({ success: false });
    expect(state.revalidated).toEqual([]);
    expect(await storedStatement()).toBe("The statement I wrote when I signed.");
  });
});
