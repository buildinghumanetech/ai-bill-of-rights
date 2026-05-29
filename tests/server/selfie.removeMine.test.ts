import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../_helpers/pglite-db";
import { selfies, signers } from "@/lib/db/schema";
import {
  approveSelfie,
  removeMySelfie,
  submitSelfie,
} from "@/server/actions/selfie";
import { createInMemoryBackend } from "@/lib/storage/blob";
import { tinyPngBuffer } from "../_fixtures/tiny-png";

describe("removeMySelfie", () => {
  it("marks the active selfie as removed and deletes all blobs including the original", async () => {
    const db = await createTestDb();
    const [signer] = await db
      .insert(signers)
      .values({
        clerkUserId: "u1",
        displayName: "U1",
        verificationMethod: "email",
        verifiedAt: new Date(),
      })
      .returning({ id: signers.id });
    const [admin] = await db
      .insert(signers)
      .values({
        clerkUserId: "admin",
        displayName: "Admin",
        verificationMethod: "email",
        verifiedAt: new Date(),
        isAdmin: true,
      })
      .returning({ id: signers.id });
    const backend = createInMemoryBackend();
    const { selfieId } = await submitSelfie(db, {
      signerId: signer.id,
      buffer: tinyPngBuffer(),
      mime: "image/png",
      captureMethod: "live",
      blobBackend: backend,
    });
    await approveSelfie(db, { selfieId, adminSignerId: admin.id });
    expect(backend.store.size).toBe(3);

    await removeMySelfie(db, {
      signerId: signer.id,
      blobBackend: backend,
    });

    const [row] = await db
      .select()
      .from(selfies)
      .where(eq(selfies.id, selfieId));
    expect(row.removedAt).not.toBeNull();
    // All three blobs (including the original) are deleted — the disclaimer
    // promises removal, so nothing should linger in storage.
    expect(backend.store.size).toBe(0);
  });

  it("no-op when no active selfie exists", async () => {
    const db = await createTestDb();
    const [signer] = await db
      .insert(signers)
      .values({
        clerkUserId: "u1",
        displayName: "U1",
        verificationMethod: "email",
        verifiedAt: new Date(),
      })
      .returning({ id: signers.id });
    await removeMySelfie(db, { signerId: signer.id });
    const rows = await db.select().from(selfies);
    expect(rows).toHaveLength(0);
  });
});
