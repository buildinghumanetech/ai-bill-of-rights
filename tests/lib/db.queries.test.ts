import { describe, expect, it } from "vitest";
import { createTestDb } from "../_helpers/pglite-db";
import { syncVersions } from "@/lib/db/sync";
import { getCurrentVersion, getSignatureCount, listSignatures, getSignerById } from "@/lib/db/queries";
import { signers, consentRecords, signatures, versions } from "@/lib/db/schema";

const sample = (version: string, isCurrent: boolean) => ({
  version,
  publishedAt: new Date(),
  markdown: `---\nversion: ${version}\n---\n# T {#preamble}\nx {#preamble-s-1}\n`,
  agentsMd: "stub",
  specJson: "{}",
  isCurrent,
  gitCommitSha: null,
});

describe("db queries", () => {
  it("getCurrentVersion returns the version flagged is_current", async () => {
    const db = await createTestDb();
    await syncVersions(db, [
      sample("1.0.0", false),
      sample("1.0.1", true),
    ]);
    const current = await getCurrentVersion(db);
    expect(current?.version).toBe("1.0.1");
  });

  it("getSignatureCount returns 0 when no signatures exist", async () => {
    const db = await createTestDb();
    const count = await getSignatureCount(db);
    expect(count).toBe(0);
  });
});

describe("signer list queries", () => {
  it("listSignatures returns signers joined with their newest signature", async () => {
    const db = await createTestDb();
    await syncVersions(db, [sample("1.0.0", true)]);
    const [signerRow] = await db
      .insert(signers)
      .values({
        clerkUserId: "u1",
        displayName: "Test",
        affiliation: null,
        locationText: "Madrid",
        verificationMethod: "email",
        verifiedAt: new Date(),
      })
      .returning({ id: signers.id });
    const [record] = await db
      .insert(consentRecords)
      .values({
        signerId: signerRow.id,
        consentTextHash: "a".repeat(64),
        capturedFields: {} as any,
      })
      .returning({ id: consentRecords.id });
    const versionRow = await db.select().from(versions).limit(1);
    await db.insert(signatures).values({
      signerId: signerRow.id,
      versionId: versionRow[0].id,
      versionHashAtSigning: versionRow[0].markdownHash,
      consentRecordId: record.id,
    });

    const rows = await listSignatures(db, { limit: 10, offset: 0 });
    expect(rows).toHaveLength(1);
    expect(rows[0].displayName).toBe("Test");
    expect(rows[0].locationText).toBe("Madrid");
  });
});
