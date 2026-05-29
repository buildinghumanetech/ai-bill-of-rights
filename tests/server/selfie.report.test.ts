import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../_helpers/pglite-db";
import { selfies, selfieReports, signers } from "@/lib/db/schema";
import {
  approveSelfie,
  reportSelfie,
  resolveSelfieReports,
  submitSelfie,
} from "@/server/actions/selfie";
import { createInMemoryBackend } from "@/lib/storage/blob";
import { tinyPngBuffer } from "../_fixtures/tiny-png";

async function makeSigner(db: any, clerkId: string, isAdmin = false) {
  const [row] = await db
    .insert(signers)
    .values({
      clerkUserId: clerkId,
      displayName: clerkId,
      verificationMethod: "email",
      verifiedAt: new Date(),
      isAdmin,
    })
    .returning({ id: signers.id });
  return row.id as string;
}

async function approveOne(db: any, signerId: string, adminId: string) {
  const backend = createInMemoryBackend();
  const { selfieId } = await submitSelfie(db, {
    signerId,
    buffer: tinyPngBuffer(),
    mime: "image/png",
    captureMethod: "live",
    blobBackend: backend,
  });
  await approveSelfie(db, { selfieId, adminSignerId: adminId });
  return selfieId;
}

describe("reportSelfie", () => {
  it("inserts a report row", async () => {
    const db = await createTestDb();
    const owner = await makeSigner(db, "owner");
    const admin = await makeSigner(db, "admin", true);
    const reporter = await makeSigner(db, "reporter");
    const id = await approveOne(db, owner, admin);
    await reportSelfie(db, {
      selfieId: id,
      reporterSignerId: reporter,
      reason: "weird",
    });
    const rows = await db.select().from(selfieReports);
    expect(rows).toHaveLength(1);
    expect(rows[0].reason).toBe("weird");
  });

  it("auto-hides at threshold 3", async () => {
    const db = await createTestDb();
    const owner = await makeSigner(db, "owner");
    const admin = await makeSigner(db, "admin", true);
    const r1 = await makeSigner(db, "r1");
    const r2 = await makeSigner(db, "r2");
    const r3 = await makeSigner(db, "r3");
    const id = await approveOne(db, owner, admin);

    await reportSelfie(db, { selfieId: id, reporterSignerId: r1 });
    let [row] = await db.select().from(selfies).where(eq(selfies.id, id));
    expect(row.autoHiddenAt).toBeNull();

    await reportSelfie(db, { selfieId: id, reporterSignerId: r2 });
    [row] = await db.select().from(selfies).where(eq(selfies.id, id));
    expect(row.autoHiddenAt).toBeNull();

    await reportSelfie(db, { selfieId: id, reporterSignerId: r3 });
    [row] = await db.select().from(selfies).where(eq(selfies.id, id));
    expect(row.autoHiddenAt).not.toBeNull();
  });

  it("ignores a duplicate report from the same reporter", async () => {
    const db = await createTestDb();
    const owner = await makeSigner(db, "owner");
    const admin = await makeSigner(db, "admin", true);
    const r = await makeSigner(db, "r");
    const id = await approveOne(db, owner, admin);
    await reportSelfie(db, { selfieId: id, reporterSignerId: r });
    await reportSelfie(db, { selfieId: id, reporterSignerId: r });
    const rows = await db.select().from(selfieReports);
    expect(rows).toHaveLength(1);
  });

  it("does not auto-hide a non-approved selfie even if threshold reached", async () => {
    // Pending selfies aren't publicly visible, so the auto-hide is moot —
    // but the action must not corrupt the state.
    const db = await createTestDb();
    const owner = await makeSigner(db, "owner");
    const reporters = await Promise.all([
      makeSigner(db, "r1"),
      makeSigner(db, "r2"),
      makeSigner(db, "r3"),
    ]);
    // Submit but DON'T approve.
    const backend = createInMemoryBackend();
    const { selfieId } = await submitSelfie(db, {
      signerId: owner,
      buffer: tinyPngBuffer(),
      mime: "image/png",
      captureMethod: "live",
      blobBackend: backend,
    });
    for (const r of reporters) {
      await reportSelfie(db, { selfieId, reporterSignerId: r });
    }
    const [row] = await db
      .select()
      .from(selfies)
      .where(eq(selfies.id, selfieId));
    expect(row.autoHiddenAt).toBeNull();
    expect(row.status).toBe("pending");
  });
});

describe("resolveSelfieReports", () => {
  it("with resolution=allowed clears auto-hide and marks reports allowed", async () => {
    const db = await createTestDb();
    const owner = await makeSigner(db, "owner");
    const admin = await makeSigner(db, "admin", true);
    const r1 = await makeSigner(db, "r1");
    const r2 = await makeSigner(db, "r2");
    const r3 = await makeSigner(db, "r3");
    const id = await approveOne(db, owner, admin);
    for (const r of [r1, r2, r3]) {
      await reportSelfie(db, { selfieId: id, reporterSignerId: r });
    }
    await resolveSelfieReports(db, {
      selfieId: id,
      adminSignerId: admin,
      resolution: "allowed",
    });
    const [row] = await db.select().from(selfies).where(eq(selfies.id, id));
    expect(row.autoHiddenAt).toBeNull();
    const reports = await db.select().from(selfieReports);
    expect(reports.every((r: any) => r.resolution === "allowed")).toBe(true);
    expect(reports.every((r: any) => r.resolvedAt !== null)).toBe(true);
  });

  it("with resolution=hidden converts the selfie to rejected", async () => {
    const db = await createTestDb();
    const owner = await makeSigner(db, "owner");
    const admin = await makeSigner(db, "admin", true);
    const r = await makeSigner(db, "r");
    const id = await approveOne(db, owner, admin);
    await reportSelfie(db, { selfieId: id, reporterSignerId: r });
    await resolveSelfieReports(db, {
      selfieId: id,
      adminSignerId: admin,
      resolution: "hidden",
      blobBackend: createInMemoryBackend(),
    });
    const [row] = await db.select().from(selfies).where(eq(selfies.id, id));
    expect(row.status).toBe("rejected");
    expect(row.rejectionReason).toBe("other");
  });

  it("with resolution=hidden deletes the selfie's blobs", async () => {
    const db = await createTestDb();
    const owner = await makeSigner(db, "owner");
    const admin = await makeSigner(db, "admin", true);
    const r = await makeSigner(db, "r");
    const backend = createInMemoryBackend();
    const { selfieId } = await submitSelfie(db, {
      signerId: owner,
      buffer: tinyPngBuffer(),
      mime: "image/png",
      captureMethod: "live",
      blobBackend: backend,
    });
    await approveSelfie(db, { selfieId, adminSignerId: admin });
    await reportSelfie(db, { selfieId, reporterSignerId: r });
    expect(backend.store.size).toBe(3);

    await resolveSelfieReports(db, {
      selfieId,
      adminSignerId: admin,
      resolution: "hidden",
      blobBackend: backend,
    });

    expect(backend.store.size).toBe(0);
  });
});
