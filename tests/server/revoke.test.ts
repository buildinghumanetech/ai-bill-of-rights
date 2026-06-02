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
  versions,
  endorsements,
  comments,
  commentVotes,
} from "@/lib/db/schema";
import { recordSignature } from "@/server/actions/sign";
import { anonymizeSigner } from "@/server/actions/revoke";
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

describe("anonymizeSigner", () => {
  it("scrubs private data and anonymizes the public profile while keeping the signature", async () => {
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
    const [version] = await db
      .select({ id: versions.id })
      .from(versions)
      .limit(1);

    const [signer] = await db
      .insert(signers)
      .values({
        clerkUserId: "u1",
        displayName: "Real Name",
        affiliation: "An org",
        locationText: "A city",
        verificationMethod: "email",
        verifiedAt: new Date(),
        isAdmin: true,
      })
      .returning({ id: signers.id });
    await recordSignature(db, {
      signerId: signer.id,
      versionString: "1.0.0",
      consentTextHash: "a".repeat(64),
      capturedFields: { ip: "203.0.113.45", ip_geo_city: "A city" } as any,
    });

    // Rows in comment-system tables that the OLD hard-delete never cascaded —
    // their presence used to make DELETE FROM signers throw an FK violation.
    await db
      .insert(endorsements)
      .values({ signerId: signer.id, baseVersionId: version.id });
    const [comment] = await db
      .insert(comments)
      .values({
        baseVersionId: version.id,
        signerId: signer.id,
        anchorId: "preamble-s-1",
        body: "my comment",
      })
      .returning({ id: comments.id });
    await db
      .insert(commentVotes)
      .values({ commentId: comment.id, signerId: signer.id, direction: 1 });

    // Must not throw despite the comment-system rows above.
    await anonymizeSigner(db, signer.id);

    // Signer row remains, but the public profile is anonymized.
    const [signerAfter] = await db
      .select()
      .from(signers)
      .where(eq(signers.id, signer.id));
    expect(signerAfter).toBeDefined();
    expect(signerAfter.displayName).toMatch(/^Anonymized signer #\d+$/);
    expect(signerAfter.affiliation).toBeNull();
    expect(signerAfter.locationText).toBeNull();
    expect(signerAfter.isAdmin).toBe(false);

    // Consent record remains (proves the signature) but private capture is gone.
    const [record] = await db
      .select()
      .from(consentRecords)
      .where(eq(consentRecords.signerId, signer.id));
    expect(record).toBeDefined();
    expect(record.capturedFields).toBeNull();
    expect(record.revokedAt).not.toBeNull();

    // The signature itself survives.
    const sigsAfter = await db
      .select()
      .from(signatures)
      .where(eq(signatures.signerId, signer.id));
    expect(sigsAfter).toHaveLength(1);

    // Retained content is still attributed to the (now anonymized) signer.
    const commentsAfter = await db
      .select()
      .from(comments)
      .where(eq(comments.signerId, signer.id));
    expect(commentsAfter).toHaveLength(1);
    const endorsementsAfter = await db
      .select()
      .from(endorsements)
      .where(eq(endorsements.signerId, signer.id));
    expect(endorsementsAfter).toHaveLength(1);
  });

  it("purges selfies, selfie_reports, and best-effort deletes blobs while keeping the signer", async () => {
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
    // Two blobs per selfie now (display + thumbnail); the full-res original is
    // never persisted.
    expect(backend.store.size).toBe(2);

    // A third-party reports the signer's selfie
    await reportSelfie(db, {
      selfieId,
      reporterSignerId: otherReporter.id,
    });

    await anonymizeSigner(db, signer.id, backend);

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

    // The signer row remains (anonymized), unlike the old hard-delete.
    const [signerAfter] = await db
      .select()
      .from(signers)
      .where(eq(signers.id, signer.id));
    expect(signerAfter).toBeDefined();
    // This signer never signed (selfie only), so the label has no ordinal.
    expect(signerAfter.displayName).toBe("Anonymized account");

    // Blobs cleaned best-effort (both sizes deleted)
    expect(backend.store.size).toBe(0);
  });

  it("labels a signature-less signer 'Anonymized account' (no colliding ordinal)", async () => {
    const db = await createTestDb();
    const [signer] = await db
      .insert(signers)
      .values({
        clerkUserId: "u-no-sig",
        displayName: "Commenter Only",
        affiliation: "Some org",
        verificationMethod: "email",
        verifiedAt: new Date(),
      })
      .returning({ id: signers.id });

    await anonymizeSigner(db, signer.id);

    const [after] = await db
      .select()
      .from(signers)
      .where(eq(signers.id, signer.id));
    // getSignatureNumber would return 1 for a signer who never signed, which
    // would collide with the genuine first signer — so we use a plain label.
    expect(after.displayName).toBe("Anonymized account");
    expect(after.affiliation).toBeNull();
  });
});
