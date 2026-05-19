import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../_helpers/pglite-db";
import { syncVersions } from "@/lib/db/sync";
import { signers, consentRecords, signatures } from "@/lib/db/schema";
import { recordSignature } from "@/server/actions/sign";
import { deleteSigner } from "@/server/actions/revoke";

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
});
