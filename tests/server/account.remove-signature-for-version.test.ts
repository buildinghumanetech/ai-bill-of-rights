/**
 * `removeMySignatureForVersionAction` removes ONE signature and nothing else.
 *
 * The /account confirm copy promises that removing a signature from a version
 * keeps the account, the profile, comments, the "why I signed" statement and
 * every other version's signature. The site owner lost her whole account to a
 * "remove" that was really a delete, so this pins the narrow behaviour against
 * a real schema (pglite) rather than trusting the docstring.
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
import { syncVersions } from "@/lib/db/sync";
import { consentRecords, signatures, signers, versions } from "@/lib/db/schema";
import { recordSignature } from "@/server/signatures/record";

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
 * getDb() reaches the client through a CommonJS require("@/lib/db"), which
 * Vite's alias doesn't cover — same patch as why-i-signed.revalidate.test.ts.
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

const CLERK_ID = "user_remove_one_version";

const md = (v: string) => `---
version: ${v}
published_at: 2026-05-18
---

# T {#preamble}
x {#preamble-s-1}
`;

let db: TestDb;
let signerId: string;

async function loadAction() {
  vi.resetModules();
  const mod = await import("@/server/actions/account");
  return mod.removeMySignatureForVersionAction;
}

async function signedVersions(): Promise<string[]> {
  const rows = await db
    .select({ version: versions.version })
    .from(signatures)
    .innerJoin(versions, eq(signatures.versionId, versions.id))
    .where(eq(signatures.signerId, signerId));
  return rows.map((r) => r.version).sort();
}

beforeEach(async () => {
  db = await createTestDb();
  state.db = db;
  state.clerkUserId = CLERK_ID;
  state.revalidated = [];
  const [row] = await db
    .insert(signers)
    .values({
      clerkUserId: CLERK_ID,
      displayName: "Alexandra Petrova-Whitfield",
      affiliation: "An org",
      locationText: "A city",
      verificationMethod: "email",
      verifiedAt: new Date(),
      whyISigned: "Because my kids deserve better.",
    })
    .returning({ id: signers.id });
  signerId = row.id as string;
  // Only the current version is open for signing, so publish each version in
  // turn and sign it while it is current — the path a real multi-version
  // signer took.
  const published: string[] = [];
  for (const v of ["1.0.0", "1.1.0"]) {
    published.push(v);
    await syncVersions(
      db,
      published.map((pv) => ({
        version: pv,
        publishedAt: new Date(),
        markdown: md(pv),
        agentsMd: "stub",
        specJson: "{}",
        isCurrent: pv === v,
        gitCommitSha: null,
      })),
    );
    await recordSignature(db, {
      signerId,
      versionString: v,
      consentTextHash: "a".repeat(64),
      capturedFields: { ip: "203.0.113.45" } as any,
    });
  }
});

describe("removeMySignatureForVersionAction", () => {
  it("removes only that version's signature and keeps the signer", async () => {
    expect(await signedVersions()).toEqual(["1.0.0", "1.1.0"]);

    const remove = await loadAction();
    const res = await remove("1.0.0");
    expect(res).toEqual({ success: true });

    // The other version's signature stays.
    expect(await signedVersions()).toEqual(["1.1.0"]);

    // The signer row — profile and statement included — is untouched.
    const [signer] = await db
      .select()
      .from(signers)
      .where(eq(signers.id, signerId));
    expect(signer).toMatchObject({
      clerkUserId: CLERK_ID,
      displayName: "Alexandra Petrova-Whitfield",
      affiliation: "An org",
      locationText: "A city",
      whyISigned: "Because my kids deserve better.",
    });

    // Consent records are kept (they are the proof of what was agreed to).
    const consents = await db
      .select({ id: consentRecords.id })
      .from(consentRecords)
      .where(eq(consentRecords.signerId, signerId));
    expect(consents.length).toBeGreaterThan(0);
  });

  it("keeps the signer even after removing their last signature", async () => {
    const remove = await loadAction();
    await remove("1.0.0");
    await remove("1.1.0");
    expect(await signedVersions()).toEqual([]);
    const rows = await db
      .select({ id: signers.id })
      .from(signers)
      .where(eq(signers.id, signerId));
    expect(rows).toHaveLength(1);
  });

  it("revalidates every page that shows the signer or the count", async () => {
    const remove = await loadAction();
    await remove("1.0.0");
    expect(state.revalidated).toEqual(
      expect.arrayContaining([
        "/account",
        "/signers",
        "/signatories",
        `/signatories/${signerId}`,
        "/v/1.0.0",
        "/",
      ]),
    );
  });

  it("refuses an anonymous caller", async () => {
    state.clerkUserId = null;
    const remove = await loadAction();
    expect(await remove("1.0.0")).toMatchObject({ success: false });
    expect(await signedVersions()).toEqual(["1.0.0", "1.1.0"]);
  });
});
