import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../_helpers/pglite-db";
import { syncVersions } from "@/lib/db/sync";
import { signers, consentRecords, signatures } from "@/lib/db/schema";
import { recordSignature } from "@/server/actions/sign";
import { anonymizeSigner } from "@/server/actions/revoke";

const sampleMarkdown = `---
version: 1.0.0
published_at: 2026-05-18
---

# T {#preamble}
x {#preamble-s-1}
`;

describe("anonymizeSigner", () => {
  it("nulls out PII fields, sets revoked_at, and clears captured_fields", async () => {
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

    await anonymizeSigner(db, signer.id, 42);

    const signerAfter = await db
      .select()
      .from(signers)
      .where(eq(signers.id, signer.id));
    expect(signerAfter[0].displayName).toBe("Anonymized signer #42");
    expect(signerAfter[0].affiliation).toBeNull();
    expect(signerAfter[0].locationText).toBeNull();
    const recordsAfter = await db.select().from(consentRecords);
    expect(recordsAfter[0].revokedAt).not.toBeNull();
    expect(recordsAfter[0].capturedFields).toBeNull();
    const sigsAfter = await db.select().from(signatures);
    expect(sigsAfter).toHaveLength(1);
  });
});
