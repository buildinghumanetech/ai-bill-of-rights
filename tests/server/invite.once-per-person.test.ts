/**
 * Each email address gets at most ONE invitation, ever — from anyone.
 *
 * `sendInvitationsAction` used to email every address it was handed and record
 * nothing, so a friend could be invited by every signer who knew them, and by
 * one signer as many times as they pressed the button. Now each address is
 * claimed in `invitations` (by sha256 of the normalised address; the raw
 * address is never stored) before it is emailed, and a claim that already
 * exists means "skip". People who have already signed are skipped too.
 *
 * These drive the real server action against a pglite database, with Clerk
 * and the mailer mocked. The action reaches the db through a lazy CommonJS
 * `require("@/lib/db")`, so — as in invite.share-attribution.test.ts —
 * `Module._load` is patched to hand it a stable proxy onto this test's db.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import Module from "node:module";
import { createHash } from "node:crypto";
import { createTestDb, type TestDb } from "../_helpers/pglite-db";
import {
  consentRecords,
  invitations,
  signatures,
  signers,
  versions,
} from "@/lib/db/schema";

const state = vi.hoisted(() => {
  const s = {
    clerkUserId: null as string | null,
    current: null as unknown,
    db: null as unknown,
    /** Clerk users by id, each with the email addresses they own. */
    clerkUsers: [] as { id: string; emails: string[] }[],
    clerkThrows: false,
    clerkCalls: 0,
    /** Addresses whose send should throw. */
    failSendTo: new Set<string>(),
    sent: [] as { to: string; subject: string; text: string }[],
  };
  // `invite.ts` memoises the first db it is given for the life of the module,
  // so it gets one stable object that forwards to the current test's db.
  s.db = new Proxy(
    {},
    {
      get(_t, prop) {
        const target = s.current as Record<string | symbol, unknown>;
        const v = target[prop];
        return typeof v === "function" ? v.bind(target) : v;
      },
    },
  );
  return s;
});

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
  vi.unstubAllEnvs();
});

vi.mock("@/lib/db", () => ({
  get db() {
    return state.db;
  },
}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: state.clerkUserId }),
  clerkClient: async () => ({
    users: {
      getUserList: async ({ emailAddress }: { emailAddress: string[] }) => {
        state.clerkCalls++;
        if (state.clerkThrows) throw new Error("Clerk is down");
        const wanted = new Set(emailAddress);
        const data = state.clerkUsers
          .filter((u) => u.emails.some((e) => wanted.has(e.toLowerCase())))
          .map((u) => ({
            id: u.id,
            emailAddresses: u.emails.map((e) => ({ emailAddress: e })),
          }));
        return { data, totalCount: data.length };
      },
    },
  }),
}));
vi.mock("@/lib/email/send", () => ({
  sendEmail: async (msg: { to: string; subject: string; text: string }) => {
    if (state.failSendTo.has(msg.to)) throw new Error("mailer down");
    state.sent.push(msg);
    return { id: "email_1" };
  },
}));

import { sendInvitationsAction } from "@/server/actions/invite";
import { anonymizeSigner } from "@/server/signers/anonymize";
import { deleteSigner } from "@/server/signers/delete";

const hash = (email: string) =>
  createHash("sha256").update(email.trim().toLowerCase()).digest("hex");

let db: TestDb;
let inviterA: string;
let inviterB: string;

async function addSigner(clerkUserId: string, displayName: string) {
  const [row] = await db
    .insert(signers)
    .values({
      clerkUserId,
      displayName,
      verificationMethod: "email",
      verifiedAt: new Date(),
    })
    .returning({ id: signers.id });
  return row.id;
}

async function addSignature(signerId: string) {
  let [version] = await db.select({ id: versions.id }).from(versions).limit(1);
  if (!version) {
    [version] = await db
      .insert(versions)
      .values({
        version: "1.0.0",
        publishedAt: new Date(),
        markdownHash: "m",
        agentsMdHash: "a",
        specJsonHash: "s",
        parsedJson: {},
        isCurrent: true,
      })
      .returning({ id: versions.id });
  }
  const [consent] = await db
    .insert(consentRecords)
    .values({ signerId, consentTextHash: "h" })
    .returning({ id: consentRecords.id });
  await db.insert(signatures).values({
    signerId,
    versionId: version.id,
    versionHashAtSigning: "m",
    consentRecordId: consent.id,
  });
}

async function invitationRows() {
  return db.select().from(invitations);
}

beforeEach(async () => {
  db = await createTestDb();
  state.current = db;
  state.clerkUsers = [];
  state.clerkThrows = false;
  state.clerkCalls = 0;
  state.failSendTo = new Set();
  state.sent = [];
  inviterA = await addSigner("user_a", "Ada Lovelace");
  inviterB = await addSigner("user_b", "Grace Hopper");
  state.clerkUserId = "user_a";
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://ai-for-people.org");
});

describe("sendInvitationsAction — one invitation per address, ever", () => {
  it("sends the first invitation and records only a hash of the address", async () => {
    const res = await sendInvitationsAction(["friend@example.com"]);

    expect(res).toEqual({
      sent: ["friend@example.com"],
      skipped: [],
      failed: [],
    });
    expect(state.sent.map((m) => m.to)).toEqual(["friend@example.com"]);

    const rows = await invitationRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].emailHash).toBe(hash("friend@example.com"));
    expect(rows[0].inviterSignerId).toBe(inviterA);
    // The address itself is nowhere in the row.
    expect(JSON.stringify(rows)).not.toContain("friend@example.com");
    expect(JSON.stringify(rows)).not.toContain("example.com");
  });

  it("skips a second invitation from the same inviter, and does not email", async () => {
    await sendInvitationsAction(["friend@example.com"]);
    state.sent = [];

    const res = await sendInvitationsAction(["friend@example.com"]);

    expect(res.sent).toEqual([]);
    expect(res.skipped).toEqual([
      { email: "friend@example.com", reason: "already-invited" },
    ]);
    expect(res.failed).toEqual([]);
    expect(state.sent).toHaveLength(0);
    expect(await invitationRows()).toHaveLength(1);
  });

  it("skips an address a DIFFERENT inviter already invited, whatever its casing and whitespace", async () => {
    await sendInvitationsAction(["friend@example.com"]);
    state.sent = [];

    state.clerkUserId = "user_b";
    const res = await sendInvitationsAction(["  Friend@EXAMPLE.com "]);

    expect(res.sent).toEqual([]);
    expect(res.skipped).toEqual([
      { email: "friend@example.com", reason: "already-invited" },
    ]);
    expect(state.sent).toHaveLength(0);
    const rows = await invitationRows();
    expect(rows).toHaveLength(1);
    // The claim stays with whoever invited first.
    expect(rows[0].inviterSignerId).toBe(inviterA);
    expect(rows[0].inviterSignerId).not.toBe(inviterB);
  });

  it("only one of two concurrent requests for the same address sends", async () => {
    const [a, b] = await Promise.all([
      sendInvitationsAction(["friend@example.com"]),
      sendInvitationsAction(["friend@example.com"]),
    ]);
    expect([...a.sent, ...b.sent]).toEqual(["friend@example.com"]);
    expect([...a.skipped, ...b.skipped]).toEqual([
      { email: "friend@example.com", reason: "already-invited" },
    ]);
    expect(state.sent).toHaveLength(1);
  });

  it("skips an address belonging to a Clerk user who has signed, and records nothing", async () => {
    const signedId = await addSigner("user_signed", "Already Signed");
    await addSignature(signedId);
    state.clerkUsers = [
      { id: "user_signed", emails: ["Signed@Example.com", "other@example.com"] },
    ];

    const res = await sendInvitationsAction([
      "signed@example.com",
      "friend@example.com",
    ]);

    expect(res.sent).toEqual(["friend@example.com"]);
    expect(res.skipped).toEqual([
      { email: "signed@example.com", reason: "already-signed" },
    ]);
    expect(state.sent.map((m) => m.to)).toEqual(["friend@example.com"]);
    const hashes = (await invitationRows()).map((r) => r.emailHash);
    expect(hashes).toEqual([hash("friend@example.com")]);
  });

  it("does not count an account with no signature as signed", async () => {
    await addSigner("user_unsigned", "Account Only");
    state.clerkUsers = [{ id: "user_unsigned", emails: ["acct@example.com"] }];

    const res = await sendInvitationsAction(["acct@example.com"]);

    expect(res.sent).toEqual(["acct@example.com"]);
    expect(res.skipped).toEqual([]);
  });

  it("does not count a Clerk user with no signer row as signed", async () => {
    state.clerkUsers = [{ id: "user_nobody", emails: ["nobody@example.com"] }];
    const res = await sendInvitationsAction(["nobody@example.com"]);
    expect(res.sent).toEqual(["nobody@example.com"]);
  });

  it("still invites when the Clerk lookup fails", async () => {
    const signedId = await addSigner("user_signed", "Already Signed");
    await addSignature(signedId);
    state.clerkUsers = [{ id: "user_signed", emails: ["signed@example.com"] }];
    state.clerkThrows = true;
    const err = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await sendInvitationsAction(["signed@example.com"]);

    expect(state.clerkCalls).toBe(1);
    expect(res.sent).toEqual(["signed@example.com"]);
    expect(res.error).toBeUndefined();
    err.mockRestore();
  });

  it("reports a failed send, releases the claim, and lets a later retry send", async () => {
    state.failSendTo.add("flaky@example.com");
    const err = vi.spyOn(console, "error").mockImplementation(() => {});

    const first = await sendInvitationsAction([
      "flaky@example.com",
      "friend@example.com",
    ]);

    expect(first.sent).toEqual(["friend@example.com"]);
    expect(first.failed).toEqual(["flaky@example.com"]);
    expect(first.skipped).toEqual([]);
    expect((await invitationRows()).map((r) => r.emailHash)).toEqual([
      hash("friend@example.com"),
    ]);

    state.failSendTo.clear();
    const retry = await sendInvitationsAction(["flaky@example.com"]);

    expect(retry.sent).toEqual(["flaky@example.com"]);
    expect(retry.failed).toEqual([]);
    expect(state.sent.map((m) => m.to)).toEqual([
      "friend@example.com",
      "flaky@example.com",
    ]);
    expect(await invitationRows()).toHaveLength(2);
    err.mockRestore();
  });
});

describe("sendInvitationsAction — input handling", () => {
  it("drops invalid addresses and de-duplicates within a request", async () => {
    const res = await sendInvitationsAction([
      "not-an-email",
      "a@example.com",
      " A@Example.com ",
      "",
      "b@example.com",
    ]);

    expect(res.sent).toEqual(["a@example.com", "b@example.com"]);
    expect(res.skipped).toEqual([]);
    expect(res.failed).toEqual([]);
    expect(state.sent.map((m) => m.to).sort()).toEqual([
      "a@example.com",
      "b@example.com",
    ]);
    expect(await invitationRows()).toHaveLength(2);
  });

  it("returns an error and sends nothing when no address is valid", async () => {
    const res = await sendInvitationsAction(["nope", "also nope"]);
    expect(res.sent).toEqual([]);
    expect(res.skipped).toEqual([]);
    expect(res.failed).toEqual([]);
    expect(res.error).toBeTruthy();
    expect(state.sent).toHaveLength(0);
    expect(await invitationRows()).toHaveLength(0);
  });

  it("caps a request at 25 addresses", async () => {
    const many = Array.from({ length: 30 }, (_, i) => `p${i}@example.com`);
    const res = await sendInvitationsAction(many);
    expect(res.sent).toEqual(many.slice(0, 25));
    expect(state.sent).toHaveLength(25);
    expect(await invitationRows()).toHaveLength(25);
  });

  it("sends and records nothing when the caller is not signed in", async () => {
    state.clerkUserId = null;
    const res = await sendInvitationsAction(["friend@example.com"]);
    expect(res.sent).toEqual([]);
    expect(res.error).toBeTruthy();
    expect(state.sent).toHaveLength(0);
    expect(await invitationRows()).toHaveLength(0);
  });

  it("sends and records nothing when the caller has no signer row", async () => {
    state.clerkUserId = "user_without_a_row";
    const res = await sendInvitationsAction(["friend@example.com"]);
    expect(res.sent).toEqual([]);
    expect(res.error).toBeTruthy();
    expect(state.sent).toHaveLength(0);
    expect(await invitationRows()).toHaveLength(0);
  });
});

describe("invitations when the inviter leaves", () => {
  // The invitation row outlives its inviter either way: it is what stops the
  // address being emailed again. Only the link back to the inviter goes.
  it("deleting the inviter keeps the invitation and nulls the inviter", async () => {
    await sendInvitationsAction(["friend@example.com"]);
    await deleteSigner(db, inviterA);

    const rows = await invitationRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].inviterSignerId).toBeNull();

    state.sent = [];
    state.clerkUserId = "user_b";
    const res = await sendInvitationsAction(["friend@example.com"]);
    expect(res.skipped).toEqual([
      { email: "friend@example.com", reason: "already-invited" },
    ]);
    expect(state.sent).toHaveLength(0);
  });

  it("anonymizing the inviter keeps the invitation and forgets who sent it", async () => {
    await sendInvitationsAction(["friend@example.com"]);
    await anonymizeSigner(db, inviterA);

    const rows = await invitationRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].emailHash).toBe(hash("friend@example.com"));
    expect(rows[0].inviterSignerId).toBeNull();
  });
});
