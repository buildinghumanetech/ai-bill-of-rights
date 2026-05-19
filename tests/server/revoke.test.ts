import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../_helpers/pglite-db";
import { syncVersions } from "@/lib/db/sync";
import {
  signers,
  consentRecords,
  signatures,
  selfies,
  selfieReports,
} from "@/lib/db/schema";
import { recordSignature } from "@/server/actions/sign";
import { deleteSigner } from "@/server/actions/revoke";
import {
  approveSelfie,
  reportSelfie,
  submitSelfie,
} from "@/server/actions/selfie";
import { createInMemoryBackend } from "@/lib/storage/blob";
import { tinyPngBuffer } from "../_fixtures/tiny-png";

const sampleMarkdown = `---
version: 1.0.0
published_at: 2026-05-18
---

# T {#preamble}
x {#preamble-s-1}
`;

describe("deleteSigner", () => {
  it("removes the signer row plus all dependent signatures and consent records", async () => {
    const db = await createTestDb();
    await syncVersions(db, [
      {
        version: "1.0.0",
        publishedAt: new Date(),
        markdown: sampleMarkdown,
        agentsMd: "stub",
        specJson: "{}",
        isCurrent: true,
        gitCommitSha: null,
      },
    ]);
    const [signer] = await db
      .insert(signers)
      .values({
        clerkUserId: "u1",
        displayName: "Real Name",
        affiliation: "An org",
        locationText: "A city",
        verificationMethod: "email",
        verifiedAt: new Date(),
      })
      .returning({ id: signers.id });
    await recordSignature(db, {
      signerId: signer.id,
      versionString: "1.0.0",
      consentTextHash: "a".repeat(64),
      capturedFields: { ip: "203.0.113.45" } as any,
    });

    await deleteSigner(db, signer.id);

    const signersAfter = await db
      .select()
      .from(signers)
      .where(eq(signers.id, signer.id));
    expect(signersAfter).toHaveLength(0);
    const recordsAfter = await db
      .select()
      .from(consentRecords)
      .where(eq(consentRecords.signerId, signer.id));
    expect(recordsAfter).toHaveLength(0);
    const sigsAfter = await db
      .select()
      .from(signatures)
      .where(eq(signatures.signerId, signer.id));
    expect(sigsAfter).toHaveLength(0);
  });

  it("purges selfies, selfie_reports, and best-effort deletes blobs on revoke", async () => {
    const db = await createTestDb();
    const [signer] = await db
      .insert(signers)
      .values({
        clerkUserId: "u-selfie",
        displayName: "Selfie User",
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
    const [otherReporter] = await db
      .insert(signers)
      .values({
        clerkUserId: "reporter",
        displayName: "Reporter",
        verificationMethod: "email",
        verifiedAt: new Date(),
      })
      .returning({ id: signers.id });

    const backend = createInMemoryBackend();
    // Approved selfie owned by signer
    const { selfieId } = await submitSelfie(db, {
      signerId: signer.id,
      buffer: tinyPngBuffer(),
      mime: "image/png",
      captureMethod: "live",
      blobBackend: backend,
    });
    await approveSelfie(db, { selfieId, adminSignerId: admin.id });
    expect(backend.store.size).toBe(3);

    // A third-party reports the signer's selfie
    await reportSelfie(db, {
      selfieId,
      reporterSignerId: otherReporter.id,
    });

    // The signer themselves also reports someone else's selfie (so we have
    // a row authored by them too). For symmetry insert one against admin's
    // (no selfie for admin), then a row authored by the signer pointing at
    // their own selfie just to exercise the authored-by path.
    // (Skip the "report someone else" case to keep the FK graph minimal.)

    await deleteSigner(db, signer.id, backend);

    const selfiesAfter = await db
      .select()
      .from(selfies)
      .where(eq(selfies.signerId, signer.id));
    expect(selfiesAfter).toHaveLength(0);

    const reportsAfter = await db
      .select()
      .from(selfieReports)
      .where(eq(selfieReports.selfieId, selfieId));
    expect(reportsAfter).toHaveLength(0);

    const signersAfter = await db
      .select()
      .from(signers)
      .where(eq(signers.id, signer.id));
    expect(signersAfter).toHaveLength(0);

    // Blobs cleaned best-effort (3 sizes deleted)
    expect(backend.store.size).toBe(0);
  });
});
