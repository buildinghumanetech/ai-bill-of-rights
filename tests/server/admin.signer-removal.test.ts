/**
 * The two admin buttons on /admin/signers, against a real (pglite) database.
 *
 *  - Delete is permanent: the signer, their signature and their place in the
 *    public count are gone, via the same `deleteSigner` cascade as "Delete my
 *    account".
 *  - Anonymize scrubs identity but keeps the signature and the count.
 *
 * Both are admin-only, and Delete refuses the admin's own row.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "../_helpers/pglite-db";
import { syncVersions } from "@/lib/db/sync";
import { getSignatureCount } from "@/lib/db/queries";
import { signatures, signers } from "@/lib/db/schema";
import { recordSignature } from "@/server/signatures/record";

const ADMIN_ID = "00000000-0000-4000-8000-00000000a0d1";

const state = vi.hoisted(() => ({
  db: null as unknown,
  admin: { state: "admin" } as Record<string, unknown>,
}));

vi.mock("@/lib/db/lazy", () => ({ getDb: () => state.db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/admin/check", () => ({
  getCurrentAdmin: async () => state.admin,
}));

import {
  anonymizeSignerAction,
  deleteSignerAction,
} from "@/server/actions/admin";

const ADMIN = {
  state: "admin",
  signer: {
    id: ADMIN_ID,
    clerkUserId: "user_admin",
    displayName: "Admin",
    isAdmin: true,
  },
};

let db: TestDb;

beforeEach(async () => {
  db = await createTestDb();
  state.db = db;
  state.admin = ADMIN;
  await syncVersions(db, [
    {
      version: "1.0.0",
      publishedAt: new Date(),
      markdown: "---\nversion: 1.0.0\npublished_at: 2026-05-18\n---\n\n# T {#preamble}\nx {#preamble-s-1}\n",
      agentsMd: "stub",
      specJson: "{}",
      isCurrent: true,
      gitCommitSha: null,
    },
  ]);
});

async function seedSignedSigner(clerkUserId: string, id?: string): Promise<string> {
  const [row] = await db
    .insert(signers)
    .values({
      ...(id ? { id } : {}),
      clerkUserId,
      displayName: clerkUserId,
      verificationMethod: "email",
      verifiedAt: new Date(),
    })
    .returning({ id: signers.id });
  await recordSignature(db, {
    signerId: row.id,
    versionString: "1.0.0",
    consentTextHash: "a".repeat(64),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    capturedFields: { ip: "203.0.113.45" } as any,
  });
  return row.id as string;
}

describe("admin Delete", () => {
  it("removes the signer and their signature, and the public count drops", async () => {
    const doomed = await seedSignedSigner("user_test_91");
    await seedSignedSigner("user_other");
    expect(await getSignatureCount(db)).toBe(2);

    await expect(deleteSignerAction(doomed)).resolves.toEqual({ success: true });

    expect(await db.select().from(signers).where(eq(signers.id, doomed))).toHaveLength(0);
    expect(
      await db.select().from(signatures).where(eq(signatures.signerId, doomed)),
    ).toHaveLength(0);
    expect(await getSignatureCount(db)).toBe(1);
  });

  it("refuses the admin's own signer row", async () => {
    await seedSignedSigner("user_admin", ADMIN_ID);

    const res = await deleteSignerAction(ADMIN_ID);

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/your own signer/);
    expect(await db.select().from(signers).where(eq(signers.id, ADMIN_ID))).toHaveLength(1);
  });

  it("is admin-only", async () => {
    const doomed = await seedSignedSigner("user_test_92");
    state.admin = { state: "not-admin", signer: { ...ADMIN.signer, isAdmin: false } };

    await expect(deleteSignerAction(doomed)).rejects.toThrow(/Forbidden/);
    expect(await db.select().from(signers).where(eq(signers.id, doomed))).toHaveLength(1);
  });
});

describe("admin Anonymize", () => {
  it("scrubs the name but keeps the signature and the count", async () => {
    const target = await seedSignedSigner("user_target");
    expect(await getSignatureCount(db)).toBe(1);

    await expect(anonymizeSignerAction(target)).resolves.toEqual({ success: true });

    const [row] = await db.select().from(signers).where(eq(signers.id, target));
    expect(row.displayName).toMatch(/^Anonymized signer #\d+$/);
    expect(await getSignatureCount(db)).toBe(1);
  });

  it("is admin-only", async () => {
    const target = await seedSignedSigner("user_target");
    state.admin = { state: "unauthenticated" };

    await expect(anonymizeSignerAction(target)).rejects.toThrow(/Forbidden/);
    const [row] = await db.select().from(signers).where(eq(signers.id, target));
    expect(row.displayName).toBe("user_target");
  });
});
