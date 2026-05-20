import { describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { createTestDb } from "../_helpers/pglite-db";
import { selfies, signers } from "@/lib/db/schema";
import {
  countUnresolvedReports,
  getActiveSelfieForSigner,
  getActiveSelfiesForSigners,
  getApprovedSelfiesForAdmin,
  getAutoHiddenSelfies,
  getLatestSelfieForSigner,
  getPendingSelfies,
  getRejectedSelfies,
} from "@/lib/selfie/queries";

async function makeSigner(db: any, clerkId: string) {
  const [row] = await db
    .insert(signers)
    .values({
      clerkUserId: clerkId,
      displayName: clerkId,
      verificationMethod: "email",
      verifiedAt: new Date(),
    })
    .returning({ id: signers.id });
  return row.id as string;
}

async function insertSelfie(db: any, signerId: string, overrides: any = {}) {
  const [row] = await db
    .insert(selfies)
    .values({
      signerId,
      status: "pending",
      originalBlobUrl: "o",
      displayBlobUrl: "d",
      thumbnailBlobUrl: "t",
      originalMime: "image/jpeg",
      originalBytes: 1,
      captureMethod: "live",
      ...overrides,
    })
    .returning();
  return row;
}

describe("getActiveSelfieForSigner", () => {
  it("returns null when no selfies exist", async () => {
    const db = await createTestDb();
    const id = await makeSigner(db, "u1");
    expect(await getActiveSelfieForSigner(id, db)).toBeNull();
  });

  it("returns null when only pending exists", async () => {
    const db = await createTestDb();
    const id = await makeSigner(db, "u1");
    await insertSelfie(db, id, { status: "pending" });
    expect(await getActiveSelfieForSigner(id, db)).toBeNull();
  });

  it("returns the approved selfie", async () => {
    const db = await createTestDb();
    const id = await makeSigner(db, "u1");
    const row = await insertSelfie(db, id, { status: "approved" });
    const active = await getActiveSelfieForSigner(id, db);
    expect(active?.id).toBe(row.id);
  });

  it("returns null when approved selfie is auto-hidden", async () => {
    const db = await createTestDb();
    const id = await makeSigner(db, "u1");
    await insertSelfie(db, id, { status: "approved", autoHiddenAt: new Date() });
    expect(await getActiveSelfieForSigner(id, db)).toBeNull();
  });

  it("returns null when approved selfie is removed", async () => {
    const db = await createTestDb();
    const id = await makeSigner(db, "u1");
    await insertSelfie(db, id, { status: "approved", removedAt: new Date() });
    expect(await getActiveSelfieForSigner(id, db)).toBeNull();
  });

  it("returns null when approved selfie has been replaced", async () => {
    const db = await createTestDb();
    const id = await makeSigner(db, "u1");
    const old = await insertSelfie(db, id, { status: "approved" });
    // Insert a successor (pending) and then point the old row at it.
    const next = await insertSelfie(db, id, { status: "pending" });
    await db
      .update(selfies)
      .set({ replacedBySelfieId: next.id })
      .where(eq(selfies.id, old.id));
    expect(await getActiveSelfieForSigner(id, db)).toBeNull();
  });
});

describe("getActiveSelfiesForSigners", () => {
  it("returns empty map for empty input", async () => {
    const db = await createTestDb();
    const map = await getActiveSelfiesForSigners([], db);
    expect(map.size).toBe(0);
  });

  it("returns active selfies keyed by signer id", async () => {
    const db = await createTestDb();
    const a = await makeSigner(db, "a");
    const b = await makeSigner(db, "b");
    const c = await makeSigner(db, "c");
    await insertSelfie(db, a, { status: "approved" });
    await insertSelfie(db, b, { status: "pending" });
    // c has no selfie
    const map = await getActiveSelfiesForSigners([a, b, c], db);
    expect(map.get(a)).toBeDefined();
    expect(map.get(b)).toBeUndefined();
    expect(map.get(c)).toBeUndefined();
  });
});

describe("countUnresolvedReports", () => {
  it("returns 0 when no reports exist", async () => {
    const db = await createTestDb();
    const signer = await makeSigner(db, "u1");
    const row = await insertSelfie(db, signer);
    expect(await countUnresolvedReports(row.id, db)).toBe(0);
  });
});

describe("getLatestSelfieForSigner", () => {
  it("returns the most-recent selfie regardless of status", async () => {
    const db = await createTestDb();
    const id = await makeSigner(db, "u1");
    await insertSelfie(db, id, { status: "rejected" });
    // Sleep briefly to ensure different timestamps in pglite (defaults to now()).
    await db.execute(sql`select pg_sleep(0.01)`);
    const newer = await insertSelfie(db, id, { status: "pending" });
    const latest = await getLatestSelfieForSigner(id, db);
    expect(latest?.id).toBe(newer.id);
  });
});

describe("admin list queries", () => {
  it("getPendingSelfies returns pending rows only, with signer context", async () => {
    const db = await createTestDb();
    const a = await makeSigner(db, "alpha");
    const b = await makeSigner(db, "beta");
    await insertSelfie(db, a, { status: "pending" });
    await insertSelfie(db, b, { status: "approved" });
    const pending = await getPendingSelfies(db);
    expect(pending).toHaveLength(1);
    expect(pending[0].signer.displayName).toBe("alpha");
  });

  it("getAutoHiddenSelfies filters approved AND auto-hidden", async () => {
    const db = await createTestDb();
    const id = await makeSigner(db, "u1");
    await insertSelfie(db, id, {
      status: "approved",
      autoHiddenAt: new Date(),
    });
    const hidden = await getAutoHiddenSelfies(db);
    expect(hidden).toHaveLength(1);
    expect(hidden[0].autoHiddenAt).not.toBeNull();
  });

  it("getRejectedSelfies returns only rejected", async () => {
    const db = await createTestDb();
    const id = await makeSigner(db, "u1");
    await insertSelfie(db, id, { status: "rejected", rejectionReason: "not_a_face" });
    const rows = await getRejectedSelfies(db);
    expect(rows).toHaveLength(1);
    expect(rows[0].rejectionReason).toBe("not_a_face");
  });

  it("getApprovedSelfiesForAdmin returns approved-not-hidden", async () => {
    const db = await createTestDb();
    const ok = await makeSigner(db, "ok");
    const hidden = await makeSigner(db, "hidden");
    await insertSelfie(db, ok, { status: "approved" });
    await insertSelfie(db, hidden, {
      status: "approved",
      autoHiddenAt: new Date(),
    });
    const rows = await getApprovedSelfiesForAdmin(db);
    expect(rows).toHaveLength(1);
    expect(rows[0].signer.displayName).toBe("ok");
  });
});
