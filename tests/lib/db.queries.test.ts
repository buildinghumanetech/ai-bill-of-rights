import { describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../_helpers/pglite-db";
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

type SeededSigner = { signerId: string; recordId: string };
type SeedVersion = { id: string; markdownHash: string };

/** Insert a signer + consent record. Does not sign anything. */
async function seedSigner(db: TestDb, name: string): Promise<SeededSigner> {
  const [signer] = await db
    .insert(signers)
    .values({
      clerkUserId: `seed-${name}`,
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
}

/** Record one signature of `version` by `who` at `at`. */
async function seedSignature(
  db: TestDb,
  who: SeededSigner,
  version: SeedVersion,
  at: string | Date,
) {
  await db.insert(signatures).values({
    signerId: who.signerId,
    versionId: version.id,
    versionHashAtSigning: version.markdownHash,
    consentRecordId: who.recordId,
    signedAt: at instanceof Date ? at : new Date(at),
  });
}

/**
 * Two versions, two people, three signature rows: Alice signs v1 first, Bob
 * signs v1 second, then Alice re-signs v2 last. This is the shape publishing a
 * new version creates, and the one every count/list surface has to agree on.
 */
async function seedResignScenario(db: TestDb) {
  await syncVersions(db, [sample("1.0.0", false), sample("1.1.0", true)]);
  const [v1, v2] = await db.select().from(versions).orderBy(versions.version);
  const alice = await seedSigner(db, "Alice");
  const bob = await seedSigner(db, "Bob");
  await seedSignature(db, alice, v1, "2026-01-02T00:00:00Z");
  await seedSignature(db, bob, v1, "2026-01-03T00:00:00Z");
  await seedSignature(db, alice, v2, "2026-01-04T00:00:00Z");
  return { alice, bob, v1, v2 };
}

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
    const { alice } = await seedResignScenario(db);

    // Three signature rows, but only two humans.
    expect(await db.select().from(signatures)).toHaveLength(3);
    expect(await getSignatureCount(db)).toBe(2);
    expect(await getSignatureNumber(alice.signerId, db)).toBe(1);
  });
});

describe("listRecentSignersSince", () => {
  /** Seed a signer who has signed the one seeded version, at `signedAt`. */
  async function seedSignerWithSignature(
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
    await seedSignerWithSignature(db, { name: "Old", signedAt: new Date(now - 90 * 60 * 1000) });
    await seedSignerWithSignature(db, { name: "Recent", signedAt: new Date(now - 30 * 60 * 1000) });
    await seedSignerWithSignature(db, { name: "JustNow", signedAt: new Date(now - 60 * 1000) });

    const rows = await listRecentSignersSince(null, db);
    expect(rows.map((r) => r.displayName).sort()).toEqual(["JustNow", "Recent"]);
  });

  it("with since=<timestamp> returns only signers signed strictly after it", async () => {
    const db = await createTestDb();
    await syncVersions(db, [sample("1.0.0", true)]);
    const t0 = new Date("2026-05-19T20:00:00Z");
    await seedSignerWithSignature(db, { name: "Before", signedAt: new Date(t0.getTime() - 60_000) });
    await seedSignerWithSignature(db, { name: "Exactly", signedAt: t0 });
    await seedSignerWithSignature(db, { name: "After", signedAt: new Date(t0.getTime() + 60_000) });

    const rows = await listRecentSignersSince(t0, db);
    expect(rows.map((r) => r.displayName)).toEqual(["After"]);
  });

  it("excludes soft-banned signers", async () => {
    const db = await createTestDb();
    await syncVersions(db, [sample("1.0.0", true)]);
    const recent = new Date(Date.now() - 5 * 60 * 1000);
    await seedSignerWithSignature(db, { name: "Visible", signedAt: recent });
    await seedSignerWithSignature(db, { name: "Banned", signedAt: recent, softBanned: true });

    const rows = await listRecentSignersSince(null, db);
    expect(rows.map((r) => r.displayName)).toEqual(["Visible"]);
  });

  it("returns rows ordered by signed_at desc (newest first)", async () => {
    const db = await createTestDb();
    await syncVersions(db, [sample("1.0.0", true)]);
    const now = Date.now();
    await seedSignerWithSignature(db, { name: "Oldest", signedAt: new Date(now - 50 * 60 * 1000) });
    await seedSignerWithSignature(db, { name: "Middle", signedAt: new Date(now - 30 * 60 * 1000) });
    await seedSignerWithSignature(db, { name: "Newest", signedAt: new Date(now - 5 * 60 * 1000) });

    const rows = await listRecentSignersSince(null, db);
    expect(rows.map((r) => r.displayName)).toEqual(["Newest", "Middle", "Oldest"]);
  });

  // The ticker announces NEW SIGNERS, and /api/signers/recent returns it
  // alongside getSignatureCount(), which counts distinct people. A re-signature
  // must not be announced: the name would pop into the ticker as if someone
  // just signed while the counter beside it does not move, and a person who
  // re-signs would be announced to the whole homepage a second time.
  it("does not announce a re-signature from someone who already signed", async () => {
    const db = await createTestDb();
    await syncVersions(db, [sample("1.0.0", false), sample("1.1.0", true)]);
    const [v1, v2] = await db.select().from(versions).orderBy(versions.version);
    const now = Date.now();

    const alice = await seedSigner(db, "Alice");
    const newcomer = await seedSigner(db, "Newcomer");
    // Alice signed long ago, outside the 60-minute window.
    await seedSignature(db, alice, v1, new Date(now - 48 * 60 * 60 * 1000));
    // Both act inside the window: Alice re-signs, Newcomer signs for the first time.
    await seedSignature(db, alice, v2, new Date(now - 10 * 60 * 1000));
    await seedSignature(db, newcomer, v2, new Date(now - 5 * 60 * 1000));

    const rows = await listRecentSignersSince(null, db);
    expect(rows.map((r) => r.displayName)).toEqual(["Newcomer"]);
  });

  // The case where BOTH of a person's signatures land inside the window. An
  // "exclude anyone whose earliest signature predates the cutoff" style
  // implementation would announce them twice here.
  it("announces once when first signature and re-signature are both in the window", async () => {
    const db = await createTestDb();
    await syncVersions(db, [sample("1.0.0", false), sample("1.1.0", true)]);
    const [v1, v2] = await db.select().from(versions).orderBy(versions.version);
    const now = Date.now();

    const who = await seedSigner(db, "Prompt");
    await seedSignature(db, who, v1, new Date(now - 20 * 60 * 1000));
    await seedSignature(db, who, v2, new Date(now - 5 * 60 * 1000));

    const rows = await listRecentSignersSince(null, db);
    expect(rows.map((r) => r.displayName)).toEqual(["Prompt"]);
    // Announced at their FIRST signature's time, not the re-sign.
    expect(rows[0].signedAt.getTime()).toBeCloseTo(now - 20 * 60 * 1000, -3);
  });

  // Equal signed_at is not hypothetical: admin/bulk-created signatures and any
  // backfill that copies rows forward stamp a fixed time. Without a total
  // ordering in the "is this their first?" probe, two such rows each see the
  // other as not-earlier and both get announced.
  it("announces once when a person has two signatures with the same timestamp", async () => {
    const db = await createTestDb();
    await syncVersions(db, [sample("1.0.0", false), sample("1.1.0", true)]);
    const [v1, v2] = await db.select().from(versions).orderBy(versions.version);
    const sameInstant = new Date(Date.now() - 10 * 60 * 1000);

    const who = await seedSigner(db, "Simultaneous");
    await seedSignature(db, who, v1, sameInstant);
    await seedSignature(db, who, v2, sameInstant);

    const rows = await listRecentSignersSince(null, db);
    expect(rows.map((r) => r.displayName)).toEqual(["Simultaneous"]);
  });

  it("still announces a first-time signer of a later version", async () => {
    const db = await createTestDb();
    await syncVersions(db, [sample("1.0.0", false), sample("1.1.0", true)]);
    const [, v2] = await db.select().from(versions).orderBy(versions.version);
    const who = await seedSigner(db, "Fresh");
    await seedSignature(db, who, v2, new Date(Date.now() - 5 * 60 * 1000));

    const rows = await listRecentSignersSince(null, db);
    expect(rows.map((r) => r.displayName)).toEqual(["Fresh"]);
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
    await seedResignScenario(db);

    expect(await db.select().from(signatures)).toHaveLength(3);

    const rows = await listSignatures(db, { limit: 10, offset: 0 });
    // Alice re-signed most recently, so she is first — and appears ONCE.
    expect(rows.map((r) => r.displayName)).toEqual(["Alice", "Bob"]);
    // Her row reports the version she most recently signed.
    expect(rows[0].version).toBe("1.1.0");
    // The timestamp survives the aliased-subquery round-trip as a Date.
    // /signers and SignatureCard both call .toISOString() on it directly, so a
    // string here would throw at render while the rest of this test passed.
    expect(rows[0].signedAt).toBeInstanceOf(Date);
    expect(rows[0].signedAt.toISOString()).toBe("2026-01-04T00:00:00.000Z");
    expect(rows[1].signedAt.toISOString()).toBe("2026-01-03T00:00:00.000Z");
  });

  // Which of two same-timestamp signatures survives DISTINCT ON decides the
  // `version` shown next to the person's name. Without an id tiebreaker in the
  // DISTINCT ON sort that choice is arbitrary and can differ between loads.
  it("picks the same row deterministically when timestamps tie", async () => {
    const db = await createTestDb();
    await syncVersions(db, [sample("1.0.0", false), sample("1.1.0", true)]);
    const [v1, v2] = await db.select().from(versions).orderBy(versions.version);
    const sameInstant = new Date("2026-01-05T00:00:00Z");

    const who = await seedSigner(db, "Tied");
    await seedSignature(db, who, v1, sameInstant);
    await seedSignature(db, who, v2, sameInstant);

    const first = await listSignatures(db, { limit: 10, offset: 0 });
    expect(first).toHaveLength(1);
    // Repeated reads agree with each other.
    for (let i = 0; i < 5; i++) {
      const again = await listSignatures(db, { limit: 10, offset: 0 });
      expect(again[0].version).toBe(first[0].version);
    }
  });

  // getSignatureNumber must anchor on the signer's EARLIEST signature, or a
  // re-signer's public "You're Signer #N" jumps to a much larger number.
  it("getSignatureNumber uses the signer's first signature, not their latest", async () => {
    const db = await createTestDb();
    const { alice, bob } = await seedResignScenario(db);

    expect(await getSignatureNumber(alice.signerId, db)).toBe(1);
    expect(await getSignatureNumber(bob.signerId, db)).toBe(2);
  });
});
