import { describe, expect, it } from "vitest";
import { createTestDb } from "../_helpers/pglite-db";
import { syncVersions } from "@/lib/db/sync";
import { getCurrentVersion, getSignatureCount, listSignatures, getSignerById, listRecentSignersSince } from "@/lib/db/queries";
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

describe("listRecentSignersSince", () => {
  async function seedSigner(
    db: any,
    {
      name,
      signedAt,
      softBanned = false,
    }: { name: string; signedAt: Date; softBanned?: boolean },
  ) {
    const [signer] = await db
      .insert(signers)
      .values({
        clerkUserId: `u-${name}`,
        displayName: name,
        affiliation: null,
        locationText: "Somewhere, US",
        verificationMethod: "email" as const,
        verifiedAt: new Date("2026-01-01T00:00:00Z"),
        softBannedAt: softBanned ? new Date() : null,
      })
      .returning({ id: signers.id });
    const [record] = await db
      .insert(consentRecords)
      .values({
        signerId: signer.id,
        consentTextHash: "a".repeat(64),
        capturedFields: {} as any,
      })
      .returning({ id: consentRecords.id });
    const [versionRow] = await db.select().from(versions).limit(1);
    await db.insert(signatures).values({
      signerId: signer.id,
      versionId: versionRow.id,
      versionHashAtSigning: versionRow.markdownHash,
      consentRecordId: record.id,
      signedAt,
    });
    return signer.id;
  }

  it("with since=null returns only signers from the past 60 minutes", async () => {
    const db = await createTestDb();
    await syncVersions(db, [sample("1.0.0", true)]);
    const now = Date.now();
    await seedSigner(db, { name: "Old", signedAt: new Date(now - 90 * 60 * 1000) });
    await seedSigner(db, { name: "Recent", signedAt: new Date(now - 30 * 60 * 1000) });
    await seedSigner(db, { name: "JustNow", signedAt: new Date(now - 60 * 1000) });

    const rows = await listRecentSignersSince(null, db);
    expect(rows.map((r) => r.displayName).sort()).toEqual(["JustNow", "Recent"]);
  });

  it("with since=<timestamp> returns only signers signed strictly after it", async () => {
    const db = await createTestDb();
    await syncVersions(db, [sample("1.0.0", true)]);
    const t0 = new Date("2026-05-19T20:00:00Z");
    await seedSigner(db, { name: "Before", signedAt: new Date(t0.getTime() - 60_000) });
    await seedSigner(db, { name: "Exactly", signedAt: t0 });
    await seedSigner(db, { name: "After", signedAt: new Date(t0.getTime() + 60_000) });

    const rows = await listRecentSignersSince(t0, db);
    expect(rows.map((r) => r.displayName)).toEqual(["After"]);
  });

  it("excludes soft-banned signers", async () => {
    const db = await createTestDb();
    await syncVersions(db, [sample("1.0.0", true)]);
    const recent = new Date(Date.now() - 5 * 60 * 1000);
    await seedSigner(db, { name: "Visible", signedAt: recent });
    await seedSigner(db, { name: "Banned", signedAt: recent, softBanned: true });

    const rows = await listRecentSignersSince(null, db);
    expect(rows.map((r) => r.displayName)).toEqual(["Visible"]);
  });

  it("returns rows ordered by signed_at desc (newest first)", async () => {
    const db = await createTestDb();
    await syncVersions(db, [sample("1.0.0", true)]);
    const now = Date.now();
    await seedSigner(db, { name: "Oldest", signedAt: new Date(now - 50 * 60 * 1000) });
    await seedSigner(db, { name: "Middle", signedAt: new Date(now - 30 * 60 * 1000) });
    await seedSigner(db, { name: "Newest", signedAt: new Date(now - 5 * 60 * 1000) });

    const rows = await listRecentSignersSince(null, db);
    expect(rows.map((r) => r.displayName)).toEqual(["Newest", "Middle", "Oldest"]);
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
