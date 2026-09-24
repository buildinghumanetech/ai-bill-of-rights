/**
 * The whole referral chain, end to end, against a real (pglite) database:
 *
 *   signer A exists
 *     → A's share link is built by `signerShareUrl` (what every share button uses)
 *     → a visitor lands on it; the link's query params go through
 *       `referralCookiesToSet` exactly as src/proxy.ts feeds them
 *     → the resulting cookies sit in the visitor's jar (mocked next/headers)
 *     → the visitor, Clerk user B, creates their signer row through one of the
 *       three signer-creating actions
 *     → B's `signers.referred_by_signer_id` is A's id.
 *
 * The unit suites each pin one link of this chain with the neighbours mocked
 * (sign-from-modal.attribution mocks the upsert; profile.attribution calls the
 * upsert directly). This suite mocks only the edges — Clerk, the cookie jar,
 * email, and the Neon client, swapped for pglite — so a break anywhere in the
 * middle (e.g. an action that forgets to read the cookie, which is exactly what
 * `submitProfileAction` did) shows up as a missing attribution on a real row.
 *
 * Host: share links are moving from ai-for-people.org to theaibill.org, so
 * nothing here asserts a host — only the `ref` / `via` query params.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { createTestDb, type TestDb } from "../_helpers/pglite-db";
import { signatures, signers, versions } from "@/lib/db/schema";
import { signerShareUrl, homeShareUrl } from "@/lib/share/urls";
import {
  REF_CHANNEL_COOKIE,
  REF_COOKIE,
  referralCookiesToSet,
} from "@/lib/referral/cookie";

const state = vi.hoisted(() => ({
  db: null as unknown,
  clerkUserId: null as string | null,
  /** The visitor's browser cookie jar. */
  jar: new Map<string, string>(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = state.jar.get(name);
      return value === undefined ? undefined : { name, value };
    },
  }),
  headers: async () => new Headers(),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error(`NEXT_REDIRECT ${url}`), { redirectTo: url });
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: state.clerkUserId }),
  clerkClient: async () => ({
    users: {
      getUser: async () => ({
        primaryEmailAddressId: "idn_1",
        primaryPhoneNumberId: null,
        primaryEmailAddress: { emailAddress: "b@example.com" },
      }),
    },
  }),
}));

vi.mock("@/lib/db/lazy", () => ({ getDb: () => state.db }));
vi.mock("@/lib/db", () => ({
  get db() {
    return state.db;
  },
}));
vi.mock("@/lib/db/queries", () => ({
  getSignatureCount: async () => 1,
  getSignatureNumber: async () => 1,
}));
vi.mock("@/lib/email/send", () => ({
  sendEmail: async () => ({ id: "email_1" }),
}));

import {
  createSignerFromModal,
  recordSignatureFromModal,
} from "@/server/actions/sign-from-modal";
import { submitProfileAction } from "@/server/actions/profile";

const VERSION = "1.0.0";
const NONEXISTENT = "99999999-9999-4999-8999-999999999999";
const SITE = "https://ai-for-people.org";

let db: TestDb;

beforeEach(async () => {
  db = await createTestDb();
  state.db = db;
  state.clerkUserId = null;
  state.jar.clear();
  await db.insert(versions).values({
    version: VERSION,
    publishedAt: new Date(),
    markdownHash: "a".repeat(64),
    agentsMdHash: "b".repeat(64),
    specJsonHash: "c".repeat(64),
    parsedJson: {},
    isCurrent: true,
  });
});

async function seedSigner(clerkUserId: string, displayName = clerkUserId) {
  const [row] = await db
    .insert(signers)
    .values({
      clerkUserId,
      displayName,
      verificationMethod: "email",
      verifiedAt: new Date(),
    })
    .returning({ id: signers.id });
  return row.id as string;
}

async function signerRow(clerkUserId: string) {
  const rows = await db
    .select()
    .from(signers)
    .where(eq(signers.clerkUserId, clerkUserId));
  return rows[0];
}

/**
 * A page view through the proxy. Builds the NextRequest the proxy would see
 * (URL + the visitor's current cookies), computes the cookies exactly as
 * `referralCookiesFor` in src/proxy.ts does, then applies them to the jar the
 * way a browser would (maxAge 0 = delete).
 */
function visit(url: string) {
  const cookieHeader = [...state.jar]
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
  const req = new NextRequest(url, {
    headers: cookieHeader ? { cookie: cookieHeader } : {},
  });
  const toSet = referralCookiesToSet({
    searchParams: req.nextUrl.searchParams,
    existingRef: req.cookies.get(REF_COOKIE)?.value ?? null,
    existingChannel: req.cookies.get(REF_CHANNEL_COOKIE)?.value ?? null,
    secure: true,
  });
  for (const c of toSet) {
    if (c.maxAge === 0) state.jar.delete(c.name);
    else state.jar.set(c.name, c.value);
  }
}

const MODAL_INPUT = {
  firstName: "Bea",
  lastName: "Bee",
  method: "email" as const,
  shareLocation: false,
  versionString: VERSION,
};

function profileForm() {
  const fd = new FormData();
  fd.set("displayName", "Bea Bee");
  fd.set("version", VERSION);
  return fd;
}

describe("referral chain: share link → proxy cookies → signer row", () => {
  it("recordSignatureFromModal attributes B to A and records B's signature", async () => {
    const aId = await seedSigner("user_a", "Alice");
    visit(signerShareUrl(SITE, aId, "linkedin"));
    expect(state.jar.get(REF_COOKIE)).toBe(aId);
    expect(state.jar.get(REF_CHANNEL_COOKIE)).toBe("linkedin");

    state.clerkUserId = "user_b";
    const res = await recordSignatureFromModal(MODAL_INPUT);

    expect(res).toMatchObject({ success: true, referred: true, channel: "linkedin" });
    const b = await signerRow("user_b");
    expect(b.referredBySignerId).toBe(aId);
    const sigs = await db
      .select()
      .from(signatures)
      .where(eq(signatures.signerId, b.id));
    expect(sigs).toHaveLength(1);
  });

  it("createSignerFromModal (comment-only account) attributes B to A", async () => {
    const aId = await seedSigner("user_a");
    visit(homeShareUrl(SITE, aId, "x"));

    state.clerkUserId = "user_b";
    const res = await createSignerFromModal(MODAL_INPUT);

    expect(res.success).toBe(true);
    expect((await signerRow("user_b")).referredBySignerId).toBe(aId);
  });

  it("submitProfileAction (/sign/profile) attributes B to A", async () => {
    // The gap this suite was written for: this action used to call
    // upsertSignerProfile without reading the ref cookie at all.
    const aId = await seedSigner("user_a");
    visit(signerShareUrl(SITE, aId, "email"));

    state.clerkUserId = "user_b";
    await expect(submitProfileAction(profileForm())).rejects.toMatchObject({
      redirectTo: `/sign/consent?version=${VERSION}`,
    });

    expect((await signerRow("user_b")).referredBySignerId).toBe(aId);
  });

  it("first touch wins: a later link from C does not overwrite A", async () => {
    const aId = await seedSigner("user_a");
    const cId = await seedSigner("user_c");
    visit(signerShareUrl(SITE, aId, "linkedin"));
    visit(signerShareUrl(SITE, cId, "x"));
    expect(state.jar.get(REF_COOKIE)).toBe(aId);
    expect(state.jar.get(REF_CHANNEL_COOKIE)).toBe("linkedin");

    state.clerkUserId = "user_b";
    const res = await recordSignatureFromModal(MODAL_INPUT);

    expect(res.success).toBe(true);
    expect((await signerRow("user_b")).referredBySignerId).toBe(aId);
  });

  it("a ref to a signer who does not exist still lets B sign, unattributed", async () => {
    visit(signerShareUrl(SITE, NONEXISTENT, "copy"));
    expect(state.jar.get(REF_COOKIE)).toBe(NONEXISTENT);

    state.clerkUserId = "user_b";
    const res = await recordSignatureFromModal(MODAL_INPUT);

    expect(res).toMatchObject({ success: true, referred: false });
    const b = await signerRow("user_b");
    expect(b.referredBySignerId).toBeNull();
    const sigs = await db
      .select()
      .from(signatures)
      .where(eq(signatures.signerId, b.id));
    expect(sigs).toHaveLength(1);
  });

  it("a ref to a signer deleted after sharing still lets B sign, unattributed", async () => {
    const aId = await seedSigner("user_a");
    visit(signerShareUrl(SITE, aId, "qr"));
    await db.delete(signers).where(eq(signers.id, aId));

    state.clerkUserId = "user_b";
    const res = await recordSignatureFromModal(MODAL_INPUT);

    expect(res).toMatchObject({ success: true, referred: false });
    expect((await signerRow("user_b")).referredBySignerId).toBeNull();
  });

  it("never re-attributes an existing signer row", async () => {
    const aId = await seedSigner("user_a");
    await seedSigner("user_b", "Existing B");
    visit(signerShareUrl(SITE, aId, "linkedin"));

    state.clerkUserId = "user_b";
    const signed = await recordSignatureFromModal(MODAL_INPUT);
    expect(signed).toMatchObject({ success: true, referred: false });

    const created = await createSignerFromModal(MODAL_INPUT);
    expect(created).toMatchObject({ success: true, alreadyExists: true });

    await expect(submitProfileAction(profileForm())).rejects.toMatchObject({
      redirectTo: expect.any(String),
    });

    expect((await signerRow("user_b")).referredBySignerId).toBeNull();
  });
});

describe("referral chain is host-agnostic", () => {
  it("a link rewritten from ai-for-people.org to theaibill.org keeps identical ref/via", async () => {
    const aId = "c06cbb39-bcb6-4b3c-bd22-e0154a4c7322";
    for (const original of [
      signerShareUrl("https://ai-for-people.org", aId, "linkedin"),
      homeShareUrl("https://ai-for-people.org", aId, "confirmation-email"),
    ]) {
      const rewritten = new URL(original);
      rewritten.host = "theaibill.org";

      const before = new URL(original);
      expect(rewritten.searchParams.get("ref")).toBe(aId);
      expect(rewritten.searchParams.get("ref")).toBe(
        before.searchParams.get("ref"),
      );
      expect(rewritten.searchParams.get("via")).toBe(
        before.searchParams.get("via"),
      );
      expect(rewritten.pathname).toBe(before.pathname);

      // And the proxy computes the same cookies from either host.
      expect(
        referralCookiesToSet({ searchParams: rewritten.searchParams }),
      ).toEqual(referralCookiesToSet({ searchParams: before.searchParams }));
    }
  });
});
