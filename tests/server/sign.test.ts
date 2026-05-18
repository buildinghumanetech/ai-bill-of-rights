import { describe, expect, it } from "vitest";
import { createTestDb } from "../_helpers/pglite-db";
import { recordSignature } from "@/server/actions/sign";
import { signatures, consentRecords, signers } from "@/lib/db/schema";
import { syncVersions } from "@/lib/db/sync";

const sampleMarkdown = `---
version: 1.0.0
published_at: 2026-05-18
---

# T {#preamble}
x {#preamble-s-1}
`;

describe("recordSignature", () => {
  it("inserts signers, consent_records, and signatures atomically", async () => {
    const db = await createTestDb();
    await syncVersions(db, [
      {
        version: "1.0.0",
        publishedAt: new Date("2026-05-18T00:00:00Z"),
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
        clerkUserId: "user_test_123",
        displayName: "Test User",
        affiliation: null,
        locationText: null,
        verificationMethod: "email",
        verifiedAt: new Date(),
      })
      .returning({ id: signers.id });

    await recordSignature(db, {
      signerId: signer.id,
      versionString: "1.0.0",
      consentTextHash:
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
      capturedFields: { ip: "203.0.113.45" } as any,
    });

    const sigs = await db.select().from(signatures);
    expect(sigs).toHaveLength(1);
    const records = await db.select().from(consentRecords);
    expect(records).toHaveLength(1);
    expect(records[0].consentTextHash).toMatch(/^ba7816/);
    expect(sigs[0].consentRecordId).toBe(records[0].id);
  });

  it("rejects double-signing the same version by the same signer", async () => {
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
        clerkUserId: "user_test_123",
        displayName: "Test",
        affiliation: null,
        locationText: null,
        verificationMethod: "email",
        verifiedAt: new Date(),
      })
      .returning({ id: signers.id });

    await recordSignature(db, {
      signerId: signer.id,
      versionString: "1.0.0",
      consentTextHash: "a".repeat(64),
      capturedFields: {} as any,
    });
    await expect(
      recordSignature(db, {
        signerId: signer.id,
        versionString: "1.0.0",
        consentTextHash: "b".repeat(64),
        capturedFields: {} as any,
      }),
    ).rejects.toThrow();
  });
});
