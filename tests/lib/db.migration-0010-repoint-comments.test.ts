import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { createTestDb, type TestDb } from "../_helpers/pglite-db";
import { articles } from "@/app/HomepageArticles";
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
 * drizzle/0010 carries the existing discussion forward from v0.0.1 to v0.1.0.
 *
 * It was written as 0008 and renumbered when `main` turned out to have its own
 * 0007 and 0008. The BACKUP TABLES keep their original `_0008` names on
 * purpose — renaming them would orphan the backups in any database that has
 * already run an earlier form of this file, which is the one population the
 * migration's repair logic exists for.
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
  "0010_repoint_comments_to_v0_1_0.sql",
);

/**
 * Anchor ids, built the way the APP builds them.
 *
 * These MUST derive the article segment from `articles` rather than spell it
 * out. An earlier revision of this suite hand-typed `article-7-s-5`, matching
 * the migration's own literals — so the tests and the SQL agreed with each
 * other and both disagreed with production, where `article.number` is the
 * zero-padded string "07". Every remap branch matched zero rows and 288 tests
 * still passed. Deriving from the real array is what makes these tests
 * load-bearing: change the padding in HomepageArticles.tsx and they fail here
 * instead of silently certifying a no-op migration.
 *
 * Mirrors src/app/HomepageArticles.tsx:539 (sentences) and :604 (pills).
 */
function articleNumber(oneBased: number): string {
  const article = articles[oneBased - 1];
  if (!article) throw new Error(`no article ${oneBased} in HomepageArticles`);
  return article.number;
}

const sentenceAnchor = (article: number, sentence: number) =>
  `article-${articleNumber(article)}-s-${sentence}`;

/**
 * `slug` is passed in rather than read off the article because the interesting
 * cases are PRE-rename slugs, which by definition are no longer in the array.
 * The padding still comes from the app; only the slug is historical.
 */
const pillAnchor = (article: number, slug: string) =>
  `article-${articleNumber(article)}-connect-${slug}`;

function migrationStatements(): string[] {
  return splitMigrationSql(fs.readFileSync(MIGRATION, "utf-8"));
}

/**
 * Every (from, to) anchor mapping the migration performs, in both of the
 * forms it writes them: the `WHEN … THEN` arm the sentence shift uses, and
 * the joined `VALUES (old, new)` list the pill renames use.
 *
 * Reading the pairs — rather than just grepping for the source literal —
 * is what makes a misspelled DESTINATION detectable. A typo there passes
 * every other check in this file: the article number is still valid, the
 * source anchor is still present, and the comment still orphans.
 */
function anchorRemaps(sqlText: string): { from: string; to: string }[] {
  const cases = sqlText.matchAll(
    /=\s*'(article-[^']+)'\s*THEN\s*'(article-[^']+)'/g,
  );
  const values = sqlText.matchAll(
    /\(\s*'(article-[^']+)'(?:::text)?,\s*'(article-[^']+)'(?:::text)?\s*\)/g,
  );
  return [...cases, ...values].map((m) => ({ from: m[1], to: m[2] }));
}

/** The pill anchors HomepageArticles renders TODAY. */
function livePillAnchors(): Set<string> {
  return new Set(
    articles.flatMap((a) =>
      (a.connects ?? []).map((p) => `article-${a.number}-connect-${p.slug}`),
    ),
  );
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
      targetAnchorId: sentenceAnchor(1, 1),
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
  await seedCommentOnVersion(db, "0.0.1", "old-thread", sentenceAnchor(1, 1));
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
         SET "base_version_id" = b."base_version_id",
             "anchor_id" = COALESCE(b."anchor_id", c."anchor_id")
        FROM "comment_version_backup_0008" AS b
       WHERE c."id" = b."id"
    `),
  );
  await db.execute(
    sql.raw(`
      UPDATE "proposed_edits" AS p
         SET "base_version_id" = b."base_version_id",
             "target_anchor_id" = COALESCE(b."anchor_id", p."target_anchor_id")
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

describe("0010 repoint comments to the new current version", () => {
  it("executes every statement in the file", () => {
    // Guards against a mangled `--> statement-breakpoint` collapsing chunks or
    // a statement being dropped. The assertions on the final statement are
    // deliberately discriminating: they name the two properties that make this
    // migration safe, so splitting the CTE back into independent UPDATEs or
    // dropping the current-version guard fails here rather than silently.
    const statements = migrationStatements();
    expect(statements).toHaveLength(6);
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
    // Statements 5 and 6 repair stale pill anchors on rows ALREADY scoped to
    // 0.1.0 — draft-tab comments, and any environment where an earlier form of
    // this migration already ran. They must stay guarded on `is_current`, or
    // they would rewrite anchors on a version that is no longer the live one.
    expect(statements[4]).toMatch(/UPDATE "comments"/);
    expect(statements[4]).toMatch(/AND "is_current"/);
    expect(statements[5]).toMatch(/UPDATE "proposed_edits"/);
    expect(statements[5]).toMatch(/AND "is_current"/);
    // Each carries its rename map ONCE, as a joined VALUES list. The earlier
    // form spelled the same set out twice per statement — as CASE arms and
    // again as an `anchor_id IN (…)` filter — where a rename added to one and
    // not the other is a branch that silently matches nothing.
    expect(statements[4]).toMatch(/WITH "renames"\("old", "new"\) AS/);
    expect(statements[5]).toMatch(/WITH "renames"\("old", "new"\) AS/);
    // ...and ONCE means once: each rename source appears a single time per
    // statement. The earlier form named it twice, and a set that has to be
    // kept in sync with itself is the bug this migration keeps re-shipping.
    const timesNamed = (statement: string) =>
      (statement.match(/'article-01-connect-humanebench-principle-dignity'/g) ??
        []).length;
    expect(timesNamed(statements[4])).toBe(1);
    expect(timesNamed(statements[5])).toBe(1);
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
      [sentenceAnchor(1, 1)]: 1,
    });
  });

  it("remaps article-7-s-5 so a comment stays with its sentence", async () => {
    // v0.1.0 inserts the COPPA definition of a child into Article 7 as the new
    // s-5, pushing "Children's data is not a training asset." to s-6. Without
    // the remap the anchor still RESOLVES — which is why this is silent — but
    // it resolves to a definition nobody wrote a comment about.
    const { db, currentId } = await seedPublishedUpgrade();
    await seedCommentOnVersion(db, "0.0.1", "about-the-closing-line", sentenceAnchor(7, 5));
    // A neighbour that must NOT move, so the CASE is shown to be selective
    // rather than shifting every anchor in the article.
    await seedCommentOnVersion(db, "0.0.1", "about-s-4", sentenceAnchor(7, 4));

    await applyMigration(db);

    expect(await countCommentsByAnchor(db, currentId)).toEqual({
      [sentenceAnchor(1, 1)]: 1,
      [sentenceAnchor(7, 4)]: 1,
      [sentenceAnchor(7, 6)]: 1,
    });
  });

  it("remaps renamed Connects-to pill anchors, and leaves removed pills alone", async () => {
    // Comments can be anchored to a pill, not just a sentence:
    // `article-N-connect-<slug>`. v0.1.0 renames the HumaneBench pages to the
    // benchmark's own principle names, so those anchors move with them.
    const { db, currentId } = await seedPublishedUpgrade();
    await seedCommentOnVersion(
      db,
      "0.0.1",
      "on-a-renamed-pill",
      pillAnchor(4, "humanebench-principle-non-manipulation"),
    );
    // A pill Erika REMOVED rather than renamed. Reattaching this to some other
    // principle would misrepresent what the person said, so it must be left
    // exactly as it is — recoverable from the backup, not silently rewritten.
    await seedCommentOnVersion(
      db,
      "0.0.1",
      "on-a-removed-pill",
      pillAnchor(6, "humanebench-principle-empowerment"),
    );

    await applyMigration(db);

    expect(await countCommentsByAnchor(db, currentId)).toEqual({
      [sentenceAnchor(1, 1)]: 1,
      [pillAnchor(4, "humanebench-principle-enable-meaningful-choices")]: 1,
      [pillAnchor(6, "humanebench-principle-empowerment")]: 1,
    });
  });

  it("uses only article numbers the app actually emits", () => {
    // The guard that would have caught the unpadded-anchor bug directly,
    // without needing a seeded row to demonstrate it. Every `article-<n>-`
    // literal in the SQL is an anchor the migration expects to FIND, so if
    // <n> is not a number HomepageArticles emits, that branch is dead code
    // matching zero rows — silently, because the stale anchor still resolves
    // and nothing errors.
    const valid = new Set(articles.map((a) => a.number));
    const sqlText = fs.readFileSync(MIGRATION, "utf-8");
    const bad = [
      ...new Set(
        [...sqlText.matchAll(/'article-([^'-]+)-/g)]
          .map((m) => m[1])
          .filter((n) => !valid.has(n)),
      ),
    ];
    expect(
      bad,
      `migration references article number(s) the app never emits: ${bad.join(", ")} — HomepageArticles uses ${[...valid].join(", ")}`,
    ).toEqual([]);
  });

  it("repairs a stale pill anchor already sitting on the new version", async () => {
    // Comments written on the /proposed tab against the v0.1.0 draft — before
    // the pills were renamed — are already on the target version, so the
    // src->tgt move cannot reach them. Same for any environment where an
    // earlier form of this migration already ran. Statements 5-6 exist for both.
    const { db, currentId } = await seedPublishedUpgrade();
    await seedCommentOnVersion(
      db,
      "0.1.0",
      "drafted-before-the-rename",
      pillAnchor(5, "humanebench-principle-transparency"),
    );
    // A BRANCH-ONLY rename: article 10 did not exist on `main` at all, so this
    // slug is absent from the main-vs-HEAD diff the src->tgt move is built
    // from. It is reachable ONLY through the repair statements, and seeding
    // just the article-05 case above cannot detect its omission — which is
    // exactly how all four branch-only renames were missed the first time.
    await seedCommentOnVersion(
      db,
      "0.1.0",
      "drafted-on-a-branch-only-pill",
      pillAnchor(10, "humanebench-principle-equity-inclusion"),
    );

    await applyMigration(db);

    expect(await countCommentsByAnchor(db, currentId)).toEqual({
      [sentenceAnchor(1, 1)]: 1,
      [pillAnchor(5, "humanebench-principle-be-transparent-and-honest")]: 1,
      [pillAnchor(10, "humanebench-principle-design-for-equity-and-inclusion")]:
        1,
    });
  });

  it("covers every pill slug that changed, from either starting point", () => {
    // The scan above only validates article NUMBERS. It cannot catch a rename
    // with no mapping at all, nor a mapping whose DESTINATION is wrong — and
    // this migration has shipped both, each using perfectly valid numbers.
    // So this asserts the rename SET in both directions.
    //
    // Two starting points matter, and using only the first is what caused the
    // omission: `main` is where v0.0.1 comments come from, but /proposed
    // comments were written against the v0.1.0 draft, which changed shape more
    // than once while the preview was live.
    // Snapshots rather than `git show` so the test needs no repo history.
    const HISTORICAL_PILL_ANCHORS = [
      // on `main` (v0.0.1) and renamed since
      "article-01-connect-humanebench-principle-dignity",
      "article-03-connect-humanebench-principle-honesty",
      "article-04-connect-humanebench-principle-non-manipulation",
      "article-05-connect-humanebench-principle-transparency",
      "article-06-connect-humanebench-principle-empowerment",
      "article-09-connect-humanebench-respect-user-attention",
      // introduced on this branch at 293640f, renamed at 343918d
      "article-07-connect-humanebench-principle-dignity",
      "article-08-connect-humanebench-principle-long-term-wellbeing",
      "article-10-connect-humanebench-principle-equity-inclusion",
      "article-11-connect-humanebench-principle-dignity",
      // the draft as 52690a7 and 447c41c served it, before 293640f pointed
      // Articles 10 and 11 at different principles
      "article-10-connect-humanebench-principle-dignity",
      "article-11-connect-humanebench-principle-honesty",
      "article-11-connect-humanebench-as-measurement-infrastructure",
    ];
    // REMOVED or SWAPPED rather than renamed. There is no successor pill to
    // move a comment to, so leaving the anchor stale is the correct behaviour
    // and these must NOT appear in the SQL: Article 6 lost its HumaneBench
    // pill outright, and Articles 10 and 11 were re-pointed at different
    // principles, which is a different reference, not a new name for the same
    // one. Reattaching either would misrepresent what someone said.
    const DELIBERATELY_NOT_REMAPPED = new Set([
      "article-06-connect-humanebench-principle-empowerment",
      "article-10-connect-humanebench-principle-dignity",
      "article-11-connect-humanebench-principle-honesty",
      "article-11-connect-humanebench-as-measurement-infrastructure",
    ]);

    const live = livePillAnchors();
    const sqlText = fs.readFileSync(MIGRATION, "utf-8");
    const needsCarrying = HISTORICAL_PILL_ANCHORS.filter(
      (anchor) => !live.has(anchor) && !DELIBERATELY_NOT_REMAPPED.has(anchor),
    ).sort();

    // Checked PER STATEMENT, not against the file as a whole: comments and
    // proposed_edits each carry their own copy of the map, and a rename added
    // to one but not the other would pass a whole-file scan while orphaning
    // every proposed edit on that pill.
    const repairStatements = migrationStatements().slice(4);
    expect(repairStatements).toHaveLength(2);
    for (const statement of repairStatements) {
      const table = statement.includes('UPDATE "comments"')
        ? "comments"
        : "proposed_edits";
      const pillRemaps = anchorRemaps(statement).filter((r) =>
        r.to.includes("-connect-"),
      );

      // EXACTLY the set that needs carrying — an equality, not a subset, so it
      // fails in both directions: an omission orphans a comment, and an extra
      // is a mapping for a pill that never existed, which is dead code that
      // reads as coverage. Both have shipped here.
      expect(
        [...new Set(pillRemaps.map((r) => r.from))].sort(),
        `${table}: pill rename sources must be exactly the renamed-and-not-superseded set`,
      ).toEqual(needsCarrying);

      // Every DESTINATION has to be an anchor the app renders TODAY, or the
      // remap just moves the comment from one dead anchor to another.
      const deadTargets = [
        ...new Set(pillRemaps.map((r) => r.to).filter((to) => !live.has(to))),
      ];
      expect(
        deadTargets,
        `${table}: remap destination(s) that no pill renders: ${deadTargets.join(", ")}`,
      ).toEqual([]);
    }

    for (const anchor of DELIBERATELY_NOT_REMAPPED) {
      expect(
        sqlText.includes(`'${anchor}'`),
        `${anchor} was removed or swapped, not renamed — it must not be remapped`,
      ).toBe(false);
    }
  });

  it("does not orphan a comment when the backup has no anchor to restore", async () => {
    // An earlier form of this migration created the backup tables with no anchor_id
    // column; step 1b adds it with nothing to backfill from, so those rows
    // carry NULL. The published rollback must not write that NULL over a live
    // anchor — a comment with neither an anchor nor a proposal is orphaned,
    // and the proposed_edits half would then violate NOT NULL.
    const { db, editId } = await seedPublishedUpgrade();
    const oldId = await versionId(db, "0.0.1");
    await applyMigration(db);
    await db.execute(
      sql.raw(`UPDATE "comment_version_backup_0008" SET "anchor_id" = NULL`),
    );
    await db.execute(
      sql.raw(
        `UPDATE "proposed_edit_version_backup_0008" SET "anchor_id" = NULL`,
      ),
    );

    // Plain await, not `expect(...).resolves.not.toThrow()`: vitest's toThrow
    // short-circuits to a pass when the subject is a non-function under
    // `resolves` + negation, so that spelling asserts nothing. A rejection
    // here — the NOT NULL violation on proposed_edits — fails the test.
    await rollback(db);

    // The version is restored from the backup, and the anchor is KEPT rather
    // than nulled. It is the v0.1.0 slug, which cannot be helped: the backup
    // has no original to restore. Keeping a stale anchor beats a comment with
    // neither an anchor nor a proposal.
    const [comment] = await db
      .select({
        anchorId: comments.anchorId,
        baseVersionId: comments.baseVersionId,
      })
      .from(comments)
      .orderBy(comments.anchorId)
      .limit(1);
    expect(comment.anchorId).toBe(sentenceAnchor(1, 1));
    expect(comment.baseVersionId).toBe(oldId);

    const [edit] = await db
      .select({ targetAnchorId: proposedEdits.targetAnchorId })
      .from(proposedEdits)
      .where(eq(proposedEdits.id, editId))
      .limit(1);
    expect(edit.targetAnchorId).toBe(sentenceAnchor(1, 1));
    expect(await editVersionOf(db, editId)).toBe(oldId);
  });

  it("does not walk the anchor further on a re-run", async () => {
    // The remap is idempotent only because it is scoped to rows still on
    // 0.0.1, which the same statement moves to 0.1.0. If that coupling ever
    // broke, a second run would push s-6 to s-7 and land the comment on
    // nothing at all.
    const { db, currentId } = await seedPublishedUpgrade();
    await seedCommentOnVersion(db, "0.0.1", "about-the-closing-line", sentenceAnchor(7, 5));

    await applyMigration(db);
    await applyMigration(db);

    expect(await countCommentsByAnchor(db, currentId)).toEqual({
      [sentenceAnchor(1, 1)]: 1,
      [sentenceAnchor(7, 6)]: 1,
    });
  });

  it("records the pre-remap anchor so the move can be reversed", async () => {
    const { db } = await seedPublishedUpgrade();
    await seedCommentOnVersion(db, "0.0.1", "about-the-closing-line", sentenceAnchor(7, 5));

    await applyMigration(db);

    // The backup holds the ORIGINAL anchor, not the remapped one — otherwise
    // the rollback SQL would restore the version scoping while leaving every
    // comment pointing one sentence past where it was written.
    const rows = await db.execute(
      sql.raw(
        `SELECT "anchor_id" FROM "comment_version_backup_0008" ORDER BY "anchor_id"`,
      ),
    );
    const anchors = (
      (rows as unknown as { rows?: { anchor_id: string }[] }).rows ??
      (rows as unknown as { anchor_id: string }[])
    ).map((r) => r.anchor_id);
    expect(anchors).toEqual([sentenceAnchor(1, 1), sentenceAnchor(7, 5)]);
  });

  it("moves proposed edits along with comments", async () => {
    const { db, currentId, editId } = await seedPublishedUpgrade();
    expect(await editVersionOf(db, editId)).not.toBe(currentId);

    await applyMigration(db);

    expect(await editVersionOf(db, editId)).toBe(currentId);
  });

  it("leaves comments already on the new version alone", async () => {
    const { db, currentId } = await seedPublishedUpgrade();
    await seedCommentOnVersion(db, "0.1.0", "new-thread", sentenceAnchor(11, 1));
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
    await seedCommentOnVersion(db, "0.0.1", "only-thread", sentenceAnchor(1, 1));
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
    await seedCommentOnVersion(db, "0.0.1", "stranded", sentenceAnchor(1, 1));
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
    await seedCommentOnVersion(db, "0.0.1", "before-early-run", sentenceAnchor(1, 1));
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
    await seedCommentOnVersion(db, "0.0.1", "after-early-run", sentenceAnchor(2, 1));
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
