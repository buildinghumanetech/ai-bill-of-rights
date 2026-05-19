import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../_helpers/pglite-db";
import { selfies, signers } from "@/lib/db/schema";
import {
  approveSelfie,
  rejectSelfie,
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

async function submitOne(db: any, signerId: string) {
  const backend = createInMemoryBackend();
  const { selfieId } = await submitSelfie(db, {
    signerId,
    buffer: tinyPngBuffer(),
    mime: "image/png",
    captureMethod: "live",
    blobBackend: backend,
  });
  return selfieId;
}

describe("approveSelfie", () => {
  it("transitions pending → approved with reviewer + timestamp stamped", async () => {
    const db = await createTestDb();
    const signer = await makeSigner(db, "u1");
    const admin = await makeSigner(db, "admin", true);
    const id = await submitOne(db, signer);
    await approveSelfie(db, { selfieId: id, adminSignerId: admin });
    const [row] = await db.select().from(selfies).where(eq(selfies.id, id));
    expect(row.status).toBe("approved");
    expect(row.reviewedBy).toBe(admin);
    expect(row.reviewedAt).toBeInstanceOf(Date);
  });

  it("marks the prior active selfie as replaced when approving a new one", async () => {
    const db = await createTestDb();
    const signer = await makeSigner(db, "u1");
    const admin = await makeSigner(db, "admin", true);
    const first = await submitOne(db, signer);
    await approveSelfie(db, { selfieId: first, adminSignerId: admin });
    const second = await submitOne(db, signer);
    await approveSelfie(db, { selfieId: second, adminSignerId: admin });
    const rows = await db.select().from(selfies);
    const firstRow = rows.find((r: any) => r.id === first)!;
    const secondRow = rows.find((r: any) => r.id === second)!;
    expect(firstRow.replacedBySelfieId).toBe(second);
    expect(secondRow.status).toBe("approved");
    expect(secondRow.replacedBySelfieId).toBeNull();
  });

  it("refuses to re-approve an already-approved row", async () => {
    const db = await createTestDb();
    const signer = await makeSigner(db, "u1");
    const admin = await makeSigner(db, "admin", true);
    const id = await submitOne(db, signer);
    await approveSelfie(db, { selfieId: id, adminSignerId: admin });
    await expect(
      approveSelfie(db, { selfieId: id, adminSignerId: admin }),
    ).rejects.toThrow(/not pending/);
  });

  it("throws on unknown selfie id", async () => {
    const db = await createTestDb();
    const admin = await makeSigner(db, "admin", true);
    await expect(
      approveSelfie(db, {
        selfieId: "00000000-0000-0000-0000-000000000000",
        adminSignerId: admin,
      }),
    ).rejects.toThrow(/not found/);
  });
});

describe("rejectSelfie", () => {
  it("transitions pending → rejected with reason and optional note", async () => {
    const db = await createTestDb();
    const signer = await makeSigner(db, "u1");
    const admin = await makeSigner(db, "admin", true);
    const id = await submitOne(db, signer);
    await rejectSelfie(db, {
      selfieId: id,
      adminSignerId: admin,
      reason: "not_a_face",
      note: "looks like a logo",
    });
    const [row] = await db.select().from(selfies).where(eq(selfies.id, id));
    expect(row.status).toBe("rejected");
    expect(row.rejectionReason).toBe("not_a_face");
    expect(row.rejectionNote).toBe("looks like a logo");
    expect(row.reviewedBy).toBe(admin);
  });

  it("validates the rejection reason", async () => {
    const db = await createTestDb();
    const signer = await makeSigner(db, "u1");
    const admin = await makeSigner(db, "admin", true);
    const id = await submitOne(db, signer);
    await expect(
      rejectSelfie(db, {
        selfieId: id,
        adminSignerId: admin,
        reason: "garbage" as any,
      }),
    ).rejects.toThrow(/Invalid rejection reason/);
  });
});
