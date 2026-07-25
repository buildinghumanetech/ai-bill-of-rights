import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { createTestDb, type TestDb } from "../_helpers/pglite-db";
import { syncVersions } from "@/lib/db/sync";
import { splitMigrationSql } from "@/lib/db/split-migration";
import {
  listCommentsForVersion,
  countCommentsByAnchor,
} from "@/lib/db/queries";
import {
  comments,
  consentRecords,
  proposedEdits,
  signers,
  versions,
} from "@/lib/db/schema";

/**
 * drizzle/0008 carries the existing discussion forward from v0.0.1 to v0.1.0.
 *
 * Comments are scoped to the version row they were written against, and the
 * homepage filters on the CURRENT version — so without this migration,
 * publishing v0.1.0 hides every existing thread. These tests run the real SQL
 * file (not a reimplementation of it), split with the same helper
 * scripts/apply-migration.ts uses, against an in-memory Postgres.
 */

const MIGRATION = path.join(
  process.cwd(),
  "drizzle",
  "0008_repoint_comments_to_v0_1_0.sql",
);

function migrationStatements(): string[] {
  return splitMigrationSql(fs.readFileSync(MIGRATION, "utf-8"));
}

async function applyMigration(db: TestDb) {
  for (const statement of migrationStatements()) {
    await db.execute(sql.raw(statement));
  }
}

const doc = (version: string) => ({
  version,
  publishedAt: new Date(),
  markdown: `---\nversion: ${version}\n---\n# T {#preamble}\nx {#preamble-s-1}\n`,
  agentsMd: "stub",
  specJson: "{}",
  isCurrent: false,
  gitCommitSha: null,
});

async function seedSigner(db: TestDb, name: string) {
  const [signer] = await db
    .insert(signers)
    .values({
      clerkUserId: `u-${name}`,
      displayName: `Author of ${name}`,
      affiliation: null,
      locationText: null,
      verificationMethod: "email" as const,
      verifiedAt: new Date("2026-01-01T00:00:00Z"),
    })
    .returning({ id: signers.id });
  await db.insert(consentRecords).values({
    signerId: signer.id,
    consentTextHash: "a".repeat(64),
    capturedFields: {},
  });
  return signer.id;
}

async function versionId(db: TestDb, versionString: string) {
  const [row] = await db
    .select()
    .from(versions)
    .where(eq(versions.version, versionString))
    .limit(1);
  return row.id;
}

async function seedCommentOnVersion(
  db: TestDb,
  versionString: string,
  body: string,
  anchorId: string,
) {
  const signerId = await seedSigner(db, body);
  await db.insert(comments).values({
    baseVersionId: await versionId(db, versionString),
    anchorId,
    signerId,
    body,
  });
}

async function seedProposedEditOnVersion(
  db: TestDb,
  versionString: string,
  rationale: string,
) {
  const signerId = await seedSigner(db, rationale);
  const [row] = await db
    .insert(proposedEdits)
    .values({
      baseVersionId: await versionId(db, versionString),
      proposerSignerId: signerId,
      kind: "replace" as const,
      targetAnchorId: "article-1-s-1",
      newText: "proposed wording",
      rationale,
    })
    .returning({ id: proposedEdits.id });
  return row.id;
}

/** Seed both versions with a comment and a proposed edit on the old one. */
async function seedPublishedUpgrade() {
  const db = await createTestDb();
  await syncVersions(db, [
    { ...doc("0.0.1"), isCurrent: false },
    { ...doc("0.1.0"), isCurrent: true },
  ]);
  await seedCommentOnVersion(db, "0.0.1", "old-thread", "article-1-s-1");
  const editId = await seedProposedEditOnVersion(db, "0.0.1", "old-edit");
  return { db, currentId: await versionId(db, "0.1.0"), editId };
}

async function editVersionOf(db: TestDb, editId: string) {
  const [row] = await db
    .select({ baseVersionId: proposedEdits.baseVersionId })
    .from(proposedEdits)
    .where(eq(proposedEdits.id, editId))
    .limit(1);
  return row.baseVersionId;
}

describe("0008 repoint comments to the new current version", () => {
  it("executes every statement in the file", () => {
    // Guards against a mangled `--> statement-breakpoint` collapsing the
    // backups and the update into one chunk, or a statement being dropped.
    const statements = migrationStatements();
    expect(statements).toHaveLength(3);
    expect(statements[0]).toMatch(/comment_version_backup_0008/);
    expect(statements[1]).toMatch(/proposed_edit_version_backup_0008/);
    expect(statements[2]).toMatch(/proposed_edits/);
  });

  it("hides the existing thread without the migration (the bug it fixes)", async () => {
    const { db, currentId } = await seedPublishedUpgrade();
    const visible = await listCommentsForVersion(db, currentId);
    expect(visible).toHaveLength(0);
  });

  it("makes the existing thread visible on the new current version", async () => {
    const { db, currentId } = await seedPublishedUpgrade();
    await applyMigration(db);

    const visible = await listCommentsForVersion(db, currentId);
    expect(visible.map((c) => c.body)).toEqual(["old-thread"]);
    // The anchor is untouched, so per-anchor counts resolve too.
    expect(await countCommentsByAnchor(db, currentId)).toEqual({
      "article-1-s-1": 1,
    });
  });

  it("moves proposed edits along with comments", async () => {
    const { db, currentId, editId } = await seedPublishedUpgrade();
    expect(await editVersionOf(db, editId)).not.toBe(currentId);

    await applyMigration(db);

    expect(await editVersionOf(db, editId)).toBe(currentId);
  });

  it("leaves comments already on the new version alone", async () => {
    const { db, currentId } = await seedPublishedUpgrade();
    await seedCommentOnVersion(db, "0.1.0", "new-thread", "article-11-s-1");
    await applyMigration(db);

    const visible = await listCommentsForVersion(db, currentId);
    expect(visible.map((c) => c.body).sort()).toEqual([
      "new-thread",
      "old-thread",
    ]);
  });

  it("is safe to run twice", async () => {
    const { db, currentId } = await seedPublishedUpgrade();
    await applyMigration(db);
    await applyMigration(db);

    const visible = await listCommentsForVersion(db, currentId);
    expect(visible.map((c) => c.body)).toEqual(["old-thread"]);
  });

  it("is a no-op when the new version row does not exist yet", async () => {
    // sync-versions runs on postbuild; if the migration is run first, it must
    // not throw or blank out base_version_id.
    const db = await createTestDb();
    await syncVersions(db, [{ ...doc("0.0.1"), isCurrent: true }]);
    await seedCommentOnVersion(db, "0.0.1", "only-thread", "article-1-s-1");
    const editId = await seedProposedEditOnVersion(db, "0.0.1", "only-edit");
    const oldId = await versionId(db, "0.0.1");

    await applyMigration(db);

    const stillThere = await listCommentsForVersion(db, oldId);
    expect(stillThere.map((c) => c.body)).toEqual(["only-thread"]);
    expect(await editVersionOf(db, editId)).toBe(oldId);
  });

  it("is a no-op when 0.1.0 exists but is no longer the current version", async () => {
    // Deploy order is manual. If 0.2.0 ships before anyone runs this in
    // production, moving comments onto a non-current 0.1.0 would leave them
    // hidden AND destroy the original scoping — worse than not running at all.
    const db = await createTestDb();
    await syncVersions(db, [
      { ...doc("0.0.1"), isCurrent: false },
      { ...doc("0.1.0"), isCurrent: false },
      { ...doc("0.2.0"), isCurrent: true },
    ]);
    await seedCommentOnVersion(db, "0.0.1", "stranded", "article-1-s-1");
    const oldId = await versionId(db, "0.0.1");

    await applyMigration(db);

    const stillOnOld = await listCommentsForVersion(db, oldId);
    expect(stillOnOld.map((c) => c.body)).toEqual(["stranded"]);
    expect(await listCommentsForVersion(db, await versionId(db, "0.1.0")))
      .toHaveLength(0);
  });

  it("records the original mapping so the move can be reversed", async () => {
    const { db, currentId } = await seedPublishedUpgrade();
    const oldId = await versionId(db, "0.0.1");
    await applyMigration(db);
    expect(await listCommentsForVersion(db, currentId)).toHaveLength(1);

    // The down SQL documented in README, run against the backup table.
    await db.execute(
      sql.raw(`
        UPDATE "comments" AS c
           SET "base_version_id" = b."base_version_id"
          FROM "comment_version_backup_0008" AS b
         WHERE c."id" = b."id";
      `),
    );

    expect(await listCommentsForVersion(db, currentId)).toHaveLength(0);
    expect(
      (await listCommentsForVersion(db, oldId)).map((c) => c.body),
    ).toEqual(["old-thread"]);
  });
});
