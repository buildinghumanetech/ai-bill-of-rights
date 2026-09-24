/**
 * Short share links and "who is looking at the page", against a real (pglite)
 * database built from schema.ts.
 *
 * Two guarantees matter most here, both born of migration trouble:
 *  - short links degrade, never break: with the share_links table missing
 *    (migration 0014 unapplied) every entry point returns null instead of
 *    throwing, so callers fall back to the long link;
 *  - the homepage thanks anyone who has signed ANY version, and tells an
 *    earlier-version signer which newer version is out.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { createTestDb, type TestDb } from "../_helpers/pglite-db";
import { syncVersions } from "@/lib/db/sync";
import { shareLinks, signers } from "@/lib/db/schema";
import { recordSignature } from "@/server/signatures/record";
import { deleteSigner } from "@/server/signers/delete";
import {
  SLUG_RE,
  generateSlug,
  getOrCreateShareSlug,
  resolveShareSlug,
} from "@/lib/share/short-links";

const state = vi.hoisted(() => ({ clerkUserId: null as string | null }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: state.clerkUserId }),
}));

import { getViewerSignature } from "@/lib/viewer/signature";
import { hasSignedAnyVersion } from "@/server/signatures/has-signed";

const md = (v: string) => `---
version: ${v}
published_at: 2026-05-18
---

# T {#preamble}
x {#preamble-s-1}
`;

let db: TestDb;

async function addSigner(clerkUserId: string, displayName = "E**** A*******") {
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

/** Publish `versions` in order, making `current` the current one. */
async function publish(all: string[], current: string) {
  await syncVersions(
    db,
    all.map((v) => ({
      version: v,
      publishedAt: new Date(),
      markdown: md(v),
      agentsMd: "stub",
      specJson: "{}",
      isCurrent: v === current,
      gitCommitSha: null,
    })),
  );
}

async function sign(signerId: string, versionString: string) {
  await recordSignature(db, {
    signerId,
    versionString,
    consentTextHash: "a".repeat(64),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    capturedFields: { ip: "203.0.113.45" } as any,
  });
}

beforeEach(async () => {
  db = await createTestDb();
  state.clerkUserId = null;
});

describe("short share links", () => {
  it("generates slugs with no look-alike characters", () => {
    for (let i = 0; i < 200; i++) {
      const slug = generateSlug();
      expect(slug).toMatch(SLUG_RE);
      expect(slug).not.toMatch(/[01ilo]/);
    }
  });

  it("creates one slug per signer and keeps returning it", async () => {
    const a = await addSigner("user_a");
    const first = await getOrCreateShareSlug(db, a);
    expect(first).toMatch(SLUG_RE);
    expect(await getOrCreateShareSlug(db, a)).toBe(first);
    const rows = await db.select().from(shareLinks).where(eq(shareLinks.signerId, a));
    expect(rows).toHaveLength(1);
  });

  it("gives different signers different slugs, each resolving to its owner", async () => {
    const a = await addSigner("user_a");
    const b = await addSigner("user_b");
    const sa = (await getOrCreateShareSlug(db, a))!;
    const sb = (await getOrCreateShareSlug(db, b))!;
    expect(sa).not.toBe(sb);
    expect(await resolveShareSlug(db, sa)).toBe(a);
    expect(await resolveShareSlug(db, sb)).toBe(b);
  });

  it("rejects malformed slugs without a query and unknown ones with null", async () => {
    expect(await resolveShareSlug(db, "../etc")).toBeNull();
    expect(await resolveShareSlug(db, "ABCDEFG")).toBeNull();
    expect(await resolveShareSlug(db, "zzzzzzz")).toBeNull();
  });

  it("stops resolving once the signer is deleted", async () => {
    const a = await addSigner("user_a");
    const slug = (await getOrCreateShareSlug(db, a))!;
    await deleteSigner(db, a);
    expect(await resolveShareSlug(db, slug)).toBeNull();
  });

  it("returns null — never throws — when the share_links table is missing", async () => {
    const a = await addSigner("user_a");
    await db.execute(sql`DROP TABLE share_links`);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(getOrCreateShareSlug(db, a)).resolves.toBeNull();
    await expect(resolveShareSlug(db, "k7m2p9q")).resolves.toBeNull();
    warn.mockRestore();
  });
});

describe("getViewerSignature", () => {
  it("is null for a signed-out visitor", async () => {
    expect(await getViewerSignature(db)).toBeNull();
  });

  it("is null for an account with no signer row", async () => {
    state.clerkUserId = "user_nobody";
    expect(await getViewerSignature(db)).toBeNull();
  });

  it("names a signer of the current version and their number", async () => {
    await publish(["1.0.0"], "1.0.0");
    const first = await addSigner("user_first");
    await sign(first, "1.0.0");
    const me = await addSigner("user_me");
    await sign(me, "1.0.0");

    state.clerkUserId = "user_me";
    expect(await getViewerSignature(db)).toEqual({
      signerId: me,
      signerNumber: 2,
      newVersion: null,
    });
  });

  it("names someone who signed only an earlier version, with the newer version they haven't signed", async () => {
    await publish(["1.0.0"], "1.0.0");
    const me = await addSigner("user_me");
    await sign(me, "1.0.0");
    await publish(["1.0.0", "1.1.0"], "1.1.0");

    state.clerkUserId = "user_me";
    expect(await getViewerSignature(db)).toEqual({
      signerId: me,
      signerNumber: 1,
      newVersion: "1.1.0",
    });
  });

  it("drops newVersion once they have signed the current version too, and keeps their number", async () => {
    await publish(["1.0.0"], "1.0.0");
    const me = await addSigner("user_me");
    await sign(me, "1.0.0");
    const later = await addSigner("user_later");
    await sign(later, "1.0.0");
    await publish(["1.0.0", "1.1.0"], "1.1.0");
    await sign(me, "1.1.0");

    state.clerkUserId = "user_me";
    expect(await getViewerSignature(db)).toEqual({
      signerId: me,
      signerNumber: 1,
      newVersion: null,
    });
  });

  it("is null, not a thrown error, when the lookup fails", async () => {
    state.clerkUserId = "user_me";
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const broken = {
      select: () => {
        throw new Error("db down");
      },
    };
    expect(await getViewerSignature(broken)).toBeNull();
    err.mockRestore();
  });
});

describe("hasSignedAnyVersion", () => {
  it("is false with no signer row, and for a signer with no signature", async () => {
    await publish(["1.0.0"], "1.0.0");
    expect(await hasSignedAnyVersion(db, "user_nobody")).toBe(false);
    await addSigner("user_commenter");
    expect(await hasSignedAnyVersion(db, "user_commenter")).toBe(false);
  });

  it("is true for a signer of an earlier version as well as the current one", async () => {
    await publish(["1.0.0"], "1.0.0");
    const early = await addSigner("user_early");
    await sign(early, "1.0.0");
    await publish(["1.0.0", "1.1.0"], "1.1.0");
    const now = await addSigner("user_now");
    await sign(now, "1.1.0");

    expect(await hasSignedAnyVersion(db, "user_early")).toBe(true);
    expect(await hasSignedAnyVersion(db, "user_now")).toBe(true);
  });
});
