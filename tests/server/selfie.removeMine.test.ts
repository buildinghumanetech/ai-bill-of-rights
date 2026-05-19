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
  it("marks the active selfie as removed and deletes public blobs (keeps original)", async () => {
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
    // Original still in store, display + thumbnail removed.
    expect(backend.store.size).toBe(1);
    const remaining = Array.from(backend.store.keys());
    expect(remaining[0]).toContain("original.jpg");
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
