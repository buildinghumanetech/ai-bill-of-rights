import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "../_helpers/pglite-db";
import { syncVersions } from "@/lib/db/sync";
import { unsyncVersion } from "@/lib/db/unsync-version";
import {
  comments,
  consentRecords,
  signatures,
  signers,
  versions,
} from "@/lib/db/schema";

/**
 * `syncVersions` refuses to change an already-synced version's markdown —
 * published documents are immutable. That guard also fires on a version still
 * being drafted, once any deploy (including a Vercel preview, which syncs to
 * the dev Neon branch) has synced it: editing the draft then breaks every
 * later build with a hash mismatch. `unsyncVersion` clears such a row, but
 * must never clear one that is current or that anything references.
 */

const doc = (version: string, body: string, isCurrent = false) => ({
  version,
  publishedAt: new Date(),
  markdown: `---\nversion: ${version}\n---\n# T {#preamble}\n${body} {#preamble-s-1}\n`,
  agentsMd: "stub",
  specJson: "{}",
  isCurrent,
  gitCommitSha: null,
});

async function seedSignerWithConsent(db: TestDb, name: string) {
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
}

async function rowFor(db: TestDb, version: string) {
  const [row] = await db
    .select()
    .from(versions)
    .where(eq(versions.version, version))
    .limit(1);
  return row;
}

describe("unsyncVersion", () => {
  it("reports nothing to do when the version was never synced", async () => {
    const db = await createTestDb();
    const report = await unsyncVersion(db, "9.9.9");
    expect(report.found).toBe(false);
    expect(report.deleted).toBe(false);
  });

  it("deletes an unreferenced, non-current draft", async () => {
    const db = await createTestDb();
    await syncVersions(db, [
      doc("0.0.1", "old", true),
      doc("0.1.0", "draft text"),
    ]);

    const report = await unsyncVersion(db, "0.1.0", { dryRun: false });
    expect(report.deleted).toBe(true);
    expect(await rowFor(db, "0.1.0")).toBeUndefined();
  });

  it("lets a re-sync then insert the edited text", async () => {
    // The whole point: sync, edit the file, unsync, re-sync succeeds.
    const db = await createTestDb();
    await syncVersions(db, [doc("0.0.1", "old", true), doc("0.1.0", "before")]);

    await expect(
      syncVersions(db, [doc("0.0.1", "old", true), doc("0.1.0", "AFTER")]),
    ).rejects.toThrow(/hash mismatch/);

    await unsyncVersion(db, "0.1.0", { dryRun: false });
    await syncVersions(db, [doc("0.0.1", "old", true), doc("0.1.0", "AFTER")]);

    const row = await rowFor(db, "0.1.0");
    expect(row).toBeDefined();
    const parsed = row.parsedJson as {
      articles: { paragraphs: { sentences: { text: string }[] }[] }[];
    };
    expect(parsed.articles[0].paragraphs[0].sentences[0].text).toBe("AFTER");
  });

  it("refuses when the version is current", async () => {
    const db = await createTestDb();
    await syncVersions(db, [doc("0.1.0", "live", true)]);

    const report = await unsyncVersion(db, "0.1.0", { dryRun: false });
    expect(report.deleted).toBe(false);
    expect(report.refusedBecause).toMatch(/current/);
    expect(await rowFor(db, "0.1.0")).toBeDefined();
  });

  it("refuses when someone has signed it", async () => {
    const db = await createTestDb();
    await syncVersions(db, [doc("0.0.1", "old", true), doc("0.1.0", "draft")]);
    const target = await rowFor(db, "0.1.0");
    const who = await seedSignerWithConsent(db, "Signer");
    await db.insert(signatures).values({
      signerId: who.signerId,
      versionId: target.id,
      versionHashAtSigning: target.markdownHash,
      consentRecordId: who.recordId,
    });

    const report = await unsyncVersion(db, "0.1.0", { dryRun: false });
    expect(report.deleted).toBe(false);
    expect(report.refusedBecause).toMatch(/signatures=1/);
    expect(await rowFor(db, "0.1.0")).toBeDefined();
  });

  it("refuses when comments are anchored to it", async () => {
    const db = await createTestDb();
    await syncVersions(db, [doc("0.0.1", "old", true), doc("0.1.0", "draft")]);
    const target = await rowFor(db, "0.1.0");
    const who = await seedSignerWithConsent(db, "Commenter");
    await db.insert(comments).values({
      baseVersionId: target.id,
      anchorId: "article-1-s-1",
      signerId: who.signerId,
      body: "a thought",
    });

    const report = await unsyncVersion(db, "0.1.0", { dryRun: false });
    expect(report.deleted).toBe(false);
    expect(report.refusedBecause).toMatch(/comments=1/);
    expect(await rowFor(db, "0.1.0")).toBeDefined();
  });

  it("does not delete on a dry run", async () => {
    const db = await createTestDb();
    await syncVersions(db, [doc("0.0.1", "old", true), doc("0.1.0", "draft")]);

    const report = await unsyncVersion(db, "0.1.0", { dryRun: true });
    expect(report.deleted).toBe(false);
    expect(report.refusedBecause).toBe("dry run");
    expect(await rowFor(db, "0.1.0")).toBeDefined();
  });
});
