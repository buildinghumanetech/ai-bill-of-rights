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

/** How many comment rows the migration recorded in its backup table. */
async function backupCount(db: TestDb): Promise<number> {
  return countIn(db, "comment_version_backup_0008");
}

/** How many proposed-edit rows the migration recorded in its backup table. */
async function editBackupCount(db: TestDb): Promise<number> {
  return countIn(db, "proposed_edit_version_backup_0008");
}

/** Whether a table has a primary key — 1 if the DO block's repair has run. */
async function primaryKeyCount(db: TestDb, table: string): Promise<number> {
  const res = await db.execute(
    sql.raw(`
      SELECT count(*)::int AS n FROM pg_constraint
       WHERE conrelid = '"${table}"'::regclass AND contype = 'p'
    `),
  );
  return (res as unknown as { rows: { n: number }[] }).rows[0].n;
}

/** Backup rows whose recorded mapping points at `versionId`. */
async function backupMappingCount(
  db: TestDb,
  table: string,
  versionId: string,
): Promise<number> {
  const res = await db.execute(
    sql.raw(`
      SELECT count(*)::int AS n FROM "${table}"
       WHERE "base_version_id" = '${versionId}'
    `),
  );
  return (res as unknown as { rows: { n: number }[] }).rows[0].n;
}

async function countIn(db: TestDb, table: string): Promise<number> {
  const res = await db.execute(
    sql.raw(`SELECT count(*)::int AS n FROM "${table}"`),
  );
  const rows = (res as unknown as { rows: { n: number }[] }).rows;
  return rows[0].n;
}

/** The operator-facing rollback published in README.md — both halves. */
async function rollback(db: TestDb) {
  await db.execute(
    sql.raw(`
      UPDATE "comments" AS c
         SET "base_version_id" = b."base_version_id"
        FROM "comment_version_backup_0008" AS b
       WHERE c."id" = b."id"
    `),
  );
  await db.execute(
    sql.raw(`
      UPDATE "proposed_edits" AS p
         SET "base_version_id" = b."base_version_id"
        FROM "proposed_edit_version_backup_0008" AS b
       WHERE p."id" = b."id"
    `),
  );
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
    // Guards against a mangled `--> statement-breakpoint` collapsing chunks or
    // a statement being dropped. The assertions on the final statement are
    // deliberately discriminating: they name the two properties that make this
    // migration safe, so splitting the CTE back into independent UPDATEs or
    // dropping the current-version guard fails here rather than silently.
    const statements = migrationStatements();
    expect(statements).toHaveLength(4);
    expect(statements[0]).toMatch(/CREATE TABLE IF NOT EXISTS "comment_version_backup_0008"/);
    expect(statements[1]).toMatch(/CREATE TABLE IF NOT EXISTS "proposed_edit_version_backup_0008"/);
    // Repairs a keyless backup table left by an earlier form of this migration.
    expect(statements[2]).toMatch(/ADD PRIMARY KEY/);
    // Atomic: the snapshot and both moves are one data-modifying CTE.
    expect(statements[3]).toMatch(/"moved_comments" AS/);
    expect(statements[3]).toMatch(/"snap_comments" AS/);
    expect(statements[3]).toMatch(/"snap_proposed_edits" AS/);
    // Only fires while 0.1.0 is actually current — BOTH snapshot CTEs must be
    // guarded, or a premature run freezes a stale snapshot for that table.
    expect(statements[3].match(/AND EXISTS \(SELECT 1 FROM "tgt"\)/g) ?? [])
      .toHaveLength(4); // 2 snapshots + 2 moves
    expect(statements[3]).toMatch(/AND "is_current"/);
    // The backups must NOT be populated at creation time — see the file's
    // comment: an early no-op run would otherwise freeze a stale snapshot.
    expect(statements[0]).not.toMatch(/SELECT/);
    expect(statements[1]).not.toMatch(/SELECT/);
  });

  it("survives POPULATED backup tables left over from the earlier keyless form", async () => {
    // The realistic leftover. A previous revision created these with
    // CREATE TABLE ... AS SELECT and populated them at creation time, so a real
    // leftover has ROWS and a NULLABLE "id" (CTAS carries no primary key and no
    // NOT NULL). Seeding them empty would miss both: ADD PRIMARY KEY against a
    // populated, nullable column is the statement operators will actually run,
    // and the ON CONFLICT DO NOTHING interaction only has anything to do when
    // rows are present.
    //
    // What is under test here is narrow: the pre-existing row is LEFT UNTOUCHED,
    // whatever it holds. (That its mapping is the pre-update one, so the move
    // can be reversed, is a separate property, covered by "records the original
    // mapping so the move can be reversed" below.)
    const { db, currentId } = await seedPublishedUpgrade();
    const oldId = await versionId(db, "0.0.1");
    // An UNRELATED sentinel, belonging to no version row. It has to differ from
    // what this run would write — the snap_ CTEs insert pre-update values, i.e.
    // oldId, so seeding with oldId would leave the row identical under DO
    // NOTHING, DO UPDATE, or no conflict clause at all, and the assertion could
    // not fail. It must equally not be `currentId`: that is the post-move
    // mapping, so a leftover holding it is a rollback that would be a no-op —
    // asserting the backup keeps pointing there reads as requiring the broken
    // state. A value from neither side asserts only "untouched".
    const SENTINEL = "00000000-0000-4000-8000-0000000000aa";
    await db.execute(
      sql.raw(`
        CREATE TABLE "comment_version_backup_0008" AS
          SELECT "id", '${SENTINEL}'::uuid AS "base_version_id" FROM "comments"
           WHERE "base_version_id" = '${oldId}';
        `),
    );
    await db.execute(
      sql.raw(`
        CREATE TABLE "proposed_edit_version_backup_0008" AS
          SELECT "id", '${SENTINEL}'::uuid AS "base_version_id" FROM "proposed_edits"
           WHERE "base_version_id" = '${oldId}';
        `),
    );
    // Precondition: populated...
    expect(await backupCount(db)).toBe(1);
    expect(await editBackupCount(db)).toBe(1);
    // ...and genuinely KEYLESS, so the DO block is actually exercised. Without
    // this, a future Postgres that carried a key through CTAS would make the
    // test silently stop testing the repair.
    expect(await primaryKeyCount(db, "comment_version_backup_0008")).toBe(0);
    expect(await primaryKeyCount(db, "proposed_edit_version_backup_0008")).toBe(
      0,
    );

    await applyMigration(db);

    expect(
      (await listCommentsForVersion(db, currentId)).map((c) => c.body),
    ).toEqual(["old-thread"]);
    // The repair ran.
    expect(await primaryKeyCount(db, "comment_version_backup_0008")).toBe(1);
    expect(await primaryKeyCount(db, "proposed_edit_version_backup_0008")).toBe(
      1,
    );
    // ON CONFLICT DO NOTHING: the pre-existing snapshot is kept, not duplicated
    // and not overwritten — both tables, since the DO block repairs both.
    expect(await backupCount(db)).toBe(1);
    expect(await editBackupCount(db)).toBe(1);
    expect(
      await backupMappingCount(db, "comment_version_backup_0008", SENTINEL),
    ).toBe(1);
    expect(
      await backupMappingCount(db, "proposed_edit_version_backup_0008", SENTINEL),
    ).toBe(1);
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
    const { db, currentId, editId } = await seedPublishedUpgrade();
    const oldId = await versionId(db, "0.0.1");
    await applyMigration(db);
    expect(await listCommentsForVersion(db, currentId)).toHaveLength(1);
    expect(await editVersionOf(db, editId)).toBe(currentId);

    // BOTH halves of the down SQL published in the README. The proposed_edits
    // half is operator-facing rollback procedure; if it is never executed, a
    // typo in it is discovered during a live rollback.
    await rollback(db);

    expect(await listCommentsForVersion(db, currentId)).toHaveLength(0);
    expect(
      (await listCommentsForVersion(db, oldId)).map((c) => c.body),
    ).toEqual(["old-thread"]);
    expect(await editVersionOf(db, editId)).toBe(oldId);
  });

  // The failure this migration's structure exists to prevent. The backups are
  // created unconditionally but the move is guarded, so if the backups were
  // POPULATED at creation time, an early no-op run would freeze a snapshot that
  // IF NOT EXISTS then never refreshes — and anything written against 0.0.1
  // between the two runs would be moved but absent from the backup, leaving the
  // rollback unable to restore it. Populating inside the guarded CTE avoids it.
  it("captures rows written between a premature run and the real one", async () => {
    const db = await createTestDb();
    // First: 0.1.0 exists but is not yet current — the documented no-op path.
    await syncVersions(db, [
      { ...doc("0.0.1"), isCurrent: true },
      { ...doc("0.1.0"), isCurrent: false },
    ]);
    await seedCommentOnVersion(db, "0.0.1", "before-early-run", "article-1-s-1");
    const earlyEdit = await seedProposedEditOnVersion(db, "0.0.1", "early-edit");

    await applyMigration(db);

    // The tables exist but captured nothing, because nothing moved. Asserted
    // for BOTH tables: the snapshot CTEs are guarded independently, so an
    // unguarded proposed-edit snapshot would reintroduce the bug just for it.
    expect(await backupCount(db)).toBe(0);
    expect(await editBackupCount(db)).toBe(0);
    const oldId = await versionId(db, "0.0.1");
    expect(await listCommentsForVersion(db, oldId)).toHaveLength(1);

    // A comment and a proposed edit arrive after the premature run.
    await seedCommentOnVersion(db, "0.0.1", "after-early-run", "article-2-s-1");
    const lateEdit = await seedProposedEditOnVersion(db, "0.0.1", "late-edit");

    // Now the publish completes and the migration is run for real.
    await db.update(versions).set({ isCurrent: false });
    await db
      .update(versions)
      .set({ isCurrent: true })
      .where(eq(versions.version, "0.1.0"));
    await applyMigration(db);

    const currentId = await versionId(db, "0.1.0");
    expect(
      (await listCommentsForVersion(db, currentId)).map((c) => c.body).sort(),
    ).toEqual(["after-early-run", "before-early-run"]);
    // BOTH are in the backup — including those written after the early run.
    expect(await backupCount(db)).toBe(2);
    expect(await editBackupCount(db)).toBe(2);
    expect(await editVersionOf(db, earlyEdit)).toBe(currentId);
    expect(await editVersionOf(db, lateEdit)).toBe(currentId);

    // And the rollback genuinely restores everything.
    await rollback(db);
    expect(
      (await listCommentsForVersion(db, oldId)).map((c) => c.body).sort(),
    ).toEqual(["after-early-run", "before-early-run"]);
    expect(await editVersionOf(db, earlyEdit)).toBe(oldId);
    expect(await editVersionOf(db, lateEdit)).toBe(oldId);
  });
});
