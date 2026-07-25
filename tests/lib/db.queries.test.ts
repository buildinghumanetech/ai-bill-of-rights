import { describe, expect, it } from "vitest";
import { createTestDb } from "../_helpers/pglite-db";
import { syncVersions } from "@/lib/db/sync";
import { getCurrentVersion, getSignatureCount, getSignatureNumber, listSignatures, getSignerById, listRecentSignersSince } from "@/lib/db/queries";
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

  // The signatures table is unique on (signer_id, version_id), so one person
  // who signs two versions produces two rows. getSignatureCount feeds public
  // copy that reads "N signatures" and "N other real people", and
  // getSignatureNumber feeds "You're Signer #N" — both must count humans, not
  // rows, or publishing a new version silently inflates them.
  it("getSignatureCount counts people, not rows, across versions", async () => {
    const db = await createTestDb();
    await syncVersions(db, [sample("1.0.0", false), sample("1.1.0", true)]);
    const [v1, v2] = await db.select().from(versions).orderBy(versions.version);

    const [signer] = await db
      .insert(signers)
      .values({
        clerkUserId: "u-resigner",
        displayName: "Re Signer",
        affiliation: null,
        locationText: null,
        verificationMethod: "email" as const,
        verifiedAt: new Date("2026-01-01T00:00:00Z"),
      })
      .returning({ id: signers.id });
    const [record] = await db
      .insert(consentRecords)
      .values({
        signerId: signer.id,
        consentTextHash: "a".repeat(64),
        capturedFields: {},
      })
      .returning({ id: consentRecords.id });

    for (const v of [v1, v2]) {
      await db.insert(signatures).values({
        signerId: signer.id,
        versionId: v.id,
        versionHashAtSigning: v.markdownHash,
        consentRecordId: record.id,
        signedAt: new Date("2026-01-02T00:00:00Z"),
      });
    }

    // Two signature rows, but only one human.
    const rows = await db.select().from(signatures);
    expect(rows).toHaveLength(2);
    expect(await getSignatureCount(db)).toBe(1);
    expect(await getSignatureNumber(signer.id, db)).toBe(1);
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

  // One row per PERSON, not per signature row. /signatories renders this list
  // directly under a "N signatures" header fed by getSignatureCount(), which
  // counts distinct signers — so a re-signer appearing twice here would make
  // the list contradict the number printed above it. Pagination depends on it
  // too: /signers used to dedupe within the fetched page, which meant a
  // 100-row page could render fewer than 100 people while the offset still
  // advanced by 100, silently skipping signers.
  it("listSignatures returns one row per signer, newest signature first", async () => {
    const db = await createTestDb();
    await syncVersions(db, [sample("1.0.0", false), sample("1.1.0", true)]);
    const [v1, v2] = await db.select().from(versions).orderBy(versions.version);

    const seed = async (name: string) => {
      const [signer] = await db
        .insert(signers)
        .values({
          clerkUserId: `u-${name}`,
          displayName: name,
          affiliation: null,
          locationText: null,
          verificationMethod: "email" as const,
          verifiedAt: new Date("2026-01-01T00:00:00Z"),
        })
        .returning({ id: signers.id });
      const [record] = await db
        .insert(consentRecords)
        .values({
          signerId: signer.id,
          consentTextHash: "a".repeat(64),
          capturedFields: {},
        })
        .returning({ id: consentRecords.id });
      return { signerId: signer.id, recordId: record.id };
    };
    const sign = async (
      who: { signerId: string; recordId: string },
      v: { id: string; markdownHash: string },
      at: string,
    ) =>
      db.insert(signatures).values({
        signerId: who.signerId,
        versionId: v.id,
        versionHashAtSigning: v.markdownHash,
        consentRecordId: who.recordId,
        signedAt: new Date(at),
      });

    const alice = await seed("Alice");
    const bob = await seed("Bob");
    await sign(alice, v1, "2026-01-02T00:00:00Z");
    await sign(bob, v1, "2026-01-03T00:00:00Z");
    // Alice re-signs the new version — this must not add a second row for her,
    // but it should move her to the top as the newest signature.
    await sign(alice, v2, "2026-01-04T00:00:00Z");

    expect(await db.select().from(signatures)).toHaveLength(3);

    const rows = await listSignatures(db, { limit: 10, offset: 0 });
    expect(rows.map((r) => r.displayName)).toEqual(["Alice", "Bob"]);
    // Alice's row reports the version she most recently signed.
    expect(rows[0].version).toBe("1.1.0");
  });

  // getSignatureNumber must anchor on the signer's EARLIEST signature, or a
  // re-signer's public "You're Signer #N" jumps to a much larger number.
  it("getSignatureNumber uses the signer's first signature, not their latest", async () => {
    const db = await createTestDb();
    await syncVersions(db, [sample("1.0.0", false), sample("1.1.0", true)]);
    const [v1, v2] = await db.select().from(versions).orderBy(versions.version);

    const seed = async (name: string) => {
      const [signer] = await db
        .insert(signers)
        .values({
          clerkUserId: `n-${name}`,
          displayName: name,
          affiliation: null,
          locationText: null,
          verificationMethod: "email" as const,
          verifiedAt: new Date("2026-01-01T00:00:00Z"),
        })
        .returning({ id: signers.id });
      const [record] = await db
        .insert(consentRecords)
        .values({
          signerId: signer.id,
          consentTextHash: "a".repeat(64),
          capturedFields: {},
        })
        .returning({ id: consentRecords.id });
      return { signerId: signer.id, recordId: record.id };
    };
    const sign = async (
      who: { signerId: string; recordId: string },
      v: { id: string; markdownHash: string },
      at: string,
    ) =>
      db.insert(signatures).values({
        signerId: who.signerId,
        versionId: v.id,
        versionHashAtSigning: v.markdownHash,
        consentRecordId: who.recordId,
        signedAt: new Date(at),
      });

    const alice = await seed("Alice");
    const bob = await seed("Bob");
    await sign(alice, v1, "2026-01-02T00:00:00Z"); // Alice is first
    await sign(bob, v1, "2026-01-03T00:00:00Z"); // Bob is second
    await sign(alice, v2, "2026-01-04T00:00:00Z"); // Alice re-signs, still #1

    expect(await getSignatureNumber(alice.signerId, db)).toBe(1);
    expect(await getSignatureNumber(bob.signerId, db)).toBe(2);
  });
});
