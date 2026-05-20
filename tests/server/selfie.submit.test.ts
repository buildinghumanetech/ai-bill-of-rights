import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../_helpers/pglite-db";
import { selfies, signers } from "@/lib/db/schema";
import { submitSelfie } from "@/server/actions/selfie";
import { createInMemoryBackend } from "@/lib/storage/blob";
import { tinyPngBuffer } from "../_fixtures/tiny-png";

async function makeSigner(db: any, clerkId = "u1") {
  const [row] = await db
    .insert(signers)
    .values({
      clerkUserId: clerkId,
      displayName: "Test",
      verificationMethod: "email",
      verifiedAt: new Date(),
    })
    .returning({ id: signers.id });
  return row.id as string;
}

describe("submitSelfie", () => {
  it("inserts a pending row and uploads three blobs", async () => {
    const db = await createTestDb();
    const signerId = await makeSigner(db);
    const backend = createInMemoryBackend();
    const { selfieId } = await submitSelfie(db, {
      signerId,
      buffer: tinyPngBuffer(),
      mime: "image/png",
      captureMethod: "live",
      blobBackend: backend,
    });
    const rows = await db.select().from(selfies);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(selfieId);
    expect(rows[0].status).toBe("pending");
    expect(rows[0].captureMethod).toBe("live");
    expect(backend.store.size).toBe(3);
  });

  it("uploads under selfies/<signerId>/<selfieId>/ prefix", async () => {
    const db = await createTestDb();
    const signerId = await makeSigner(db);
    const backend = createInMemoryBackend();
    const { selfieId } = await submitSelfie(db, {
      signerId,
      buffer: tinyPngBuffer(),
      mime: "image/png",
      captureMethod: "upload",
      blobBackend: backend,
    });
    const paths = Array.from(backend.store.keys());
    for (const url of paths) {
      expect(url).toContain(`selfies/${signerId}/${selfieId}/`);
    }
    expect(paths.some((p) => p.includes("original.jpg"))).toBe(true);
    expect(paths.some((p) => p.includes("display.webp"))).toBe(true);
    expect(paths.some((p) => p.includes("thumbnail.webp"))).toBe(true);
  });

  it("rejects oversize input without uploading or inserting", async () => {
    const db = await createTestDb();
    const signerId = await makeSigner(db);
    const backend = createInMemoryBackend();
    const big = Buffer.alloc(11 * 1024 * 1024, 0);
    await expect(
      submitSelfie(db, {
        signerId,
        buffer: big,
        mime: "image/jpeg",
        captureMethod: "upload",
        blobBackend: backend,
      }),
    ).rejects.toThrow(/too_large/);
    expect(backend.store.size).toBe(0);
    const rows = await db.select().from(selfies);
    expect(rows).toHaveLength(0);
  });

  it("rejects disallowed MIME without uploading", async () => {
    const db = await createTestDb();
    const signerId = await makeSigner(db);
    const backend = createInMemoryBackend();
    await expect(
      submitSelfie(db, {
        signerId,
        buffer: tinyPngBuffer(),
        mime: "application/pdf",
        captureMethod: "upload",
        blobBackend: backend,
      }),
    ).rejects.toThrow(/disallowed_mime/);
    expect(backend.store.size).toBe(0);
  });

  it("rejects empty buffer", async () => {
    const db = await createTestDb();
    const signerId = await makeSigner(db);
    const backend = createInMemoryBackend();
    await expect(
      submitSelfie(db, {
        signerId,
        buffer: Buffer.alloc(0),
        mime: "image/jpeg",
        captureMethod: "upload",
        blobBackend: backend,
      }),
    ).rejects.toThrow(/empty/);
  });

  it("enforces hourly rate limit at the 6th submission", async () => {
    const db = await createTestDb();
    const signerId = await makeSigner(db);
    const backend = createInMemoryBackend();
    for (let i = 0; i < 5; i++) {
      await submitSelfie(db, {
        signerId,
        buffer: tinyPngBuffer(),
        mime: "image/png",
        captureMethod: "upload",
        blobBackend: backend,
      });
    }
    await expect(
      submitSelfie(db, {
        signerId,
        buffer: tinyPngBuffer(),
        mime: "image/png",
        captureMethod: "upload",
        blobBackend: backend,
      }),
    ).rejects.toThrow(/rate limit/);
    const rows = await db.select().from(selfies);
    expect(rows).toHaveLength(5);
  });

  it("allows a second pending submission while the first is still pending", async () => {
    const db = await createTestDb();
    const signerId = await makeSigner(db);
    const backend = createInMemoryBackend();
    await submitSelfie(db, {
      signerId,
      buffer: tinyPngBuffer(),
      mime: "image/png",
      captureMethod: "live",
      blobBackend: backend,
    });
    await submitSelfie(db, {
      signerId,
      buffer: tinyPngBuffer(),
      mime: "image/png",
      captureMethod: "upload",
      blobBackend: backend,
    });
    const rows = await db
      .select()
      .from(selfies)
      .where(eq(selfies.signerId, signerId));
    expect(rows).toHaveLength(2);
    expect(rows.every((r: any) => r.status === "pending")).toBe(true);
  });
});
