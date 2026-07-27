-- Carry the existing discussion forward from v0.0.1 to v0.1.0.
--
-- WHY: comments are scoped to the version row they were written against
-- (comments.base_version_id), and the homepage queries filter on the CURRENT
-- version. Publishing v0.1.0 therefore hides every existing thread on / and
-- /proposed.
--
-- WHAT CHANGED IN v0.1.0, and what that means for anchors. This migration
-- originally rested on "Articles 1-9 are byte-identical, so every anchor still
-- resolves." That is NO LONGER TRUE — v0.1.0 revised the wording of Articles
-- 1, 2, 4, 5, 6 and 7. The revisions break down into three cases:
--
--   (a) Sentences APPENDED at the end of an article (5 gained two; 11 is new).
--       Existing anchors are unaffected: article-5-s-1 still addresses the same
--       sentence, and nothing shifted underneath it.
--
--   (b) Text CHANGED in place, same position (article-1-s-4, article-2-s-4,
--       article-4-s-1, article-6-s-3). The anchor still resolves and still
--       points at the same slot in the same article. The comment now sits
--       beside reworded text — for 1, 2 and 4 the claim is unchanged and only
--       sharper; for article-6-s-3 the closing line genuinely changed subject
--       ("The loop stays open." -> the AI-agent "license plate" sentence).
--       There is no better anchor to move those to, and dropping the threads
--       would lose real discussion, so they move. Highlights degrade safely:
--       the homepage matches comments.selected_text as a substring, so a
--       selection that no longer appears renders unhighlighted rather than
--       landing on the wrong words.
--
--   (c) A sentence INSERTED MID-ARTICLE. Exactly one: v0.1.0 adds the COPPA
--       definition of a child to Article 7 as the new s-5, pushing "Children's
--       data is not a training asset." from s-5 to s-6. Left alone, every
--       comment on article-7-s-5 would silently re-attach from the sentence it
--       was written about to a definition nobody has read. So this migration
--       REMAPS article-7-s-5 -> article-7-s-6 for the rows it moves, keeping
--       each comment with its sentence. The original anchor is recorded in the
--       backup tables, so the remap reverses along with the move.
--
--       If a future version inserts mid-article again, this is the case to
--       handle — and it is invisible unless someone diffs sentence counts.
--
-- TRADEOFF (decided deliberately): re-pointing loses the record of which
-- version's text each comment was written against. The backup tables below
-- preserve the original mapping AND the original anchor so the move is
-- reversible — see README for the down SQL.
--
-- ORDERING: run this AFTER sync-versions has created the v0.1.0 row AND made
-- it current (sync-versions runs on postbuild). The move targets
-- `version = '0.1.0' AND is_current`, so running it out of order — or after a
-- later version has already taken over as current — is a no-op rather than a
-- move onto a non-current version, which would leave threads hidden AND
-- destroy the original scoping. Safe to re-run.

-- 1. Backup tables: STRUCTURE ONLY, deliberately not populated here.
--
--    Populating them at creation time would be wrong. These statements run
--    unconditionally, but the move below is guarded — so on the documented
--    "safe to run early" path they would capture whatever existed at that
--    moment, and IF NOT EXISTS means the real run later would never refresh
--    them. Anything written against 0.0.1 in between would then be moved but
--    absent from the backup, and the rollback SQL would strand it on the wrong
--    version. The population happens inside the same atomic statement as the
--    move instead, so the two can never disagree.
--
--    anchor_id is nullable here because comments.anchor_id is (a comment is
--    anchored to EITHER a sentence or a proposal), and because a leftover
--    table from an earlier form of this migration gets the column added below
--    with nothing to backfill it from.
CREATE TABLE IF NOT EXISTS "comment_version_backup_0008" (
  "id" uuid PRIMARY KEY,
  "base_version_id" uuid NOT NULL,
  "anchor_id" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "proposed_edit_version_backup_0008" (
  "id" uuid PRIMARY KEY,
  "base_version_id" uuid NOT NULL,
  "anchor_id" text
);
--> statement-breakpoint
-- 1b. Repair backups left over from an earlier form of this migration.
--
--     A previous revision created these with `CREATE TABLE … AS SELECT`, which
--     produces NO primary key. `CREATE TABLE IF NOT EXISTS` above silently
--     no-ops on such a table, and the ON CONFLICT ("id") below would then fail
--     with "no unique or exclusion constraint matching the ON CONFLICT
--     specification" — aborting the run in exactly the environments most likely
--     to have run the earlier form. Add the missing key if it isn't there.
--
--     An earlier form also had no anchor_id column, and CREATE TABLE IF NOT
--     EXISTS will not add a column to a table that already exists — so add it
--     too, or the INSERTs below fail on a column that is not there.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = '"comment_version_backup_0008"'::regclass
       AND contype = 'p'
  ) THEN
    ALTER TABLE "comment_version_backup_0008" ADD PRIMARY KEY ("id");
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = '"proposed_edit_version_backup_0008"'::regclass
       AND contype = 'p'
  ) THEN
    ALTER TABLE "proposed_edit_version_backup_0008" ADD PRIMARY KEY ("id");
  END IF;
  ALTER TABLE "comment_version_backup_0008"
    ADD COLUMN IF NOT EXISTS "anchor_id" text;
  ALTER TABLE "proposed_edit_version_backup_0008"
    ADD COLUMN IF NOT EXISTS "anchor_id" text;
END $$;
--> statement-breakpoint
-- 2. Snapshot and move, in a SINGLE statement.
--
--    scripts/apply-migration.ts sends each statement as its own request (neon
--    serverless HTTP — one implicit transaction per call), so separate
--    statements could leave the backups and the two tables inconsistent if one
--    failed. Every sub-statement of a data-modifying CTE sees the same
--    snapshot, so the INSERTs record pre-update values even though the UPDATEs
--    run in the same statement.
--
--    ON CONFLICT DO NOTHING keeps the FIRST run's mapping on a re-run while
--    still capturing any rows a previous (no-op) run did not see.
--
--    The article-7-s-5 -> article-7-s-6 remap is idempotent for free: it only
--    touches rows still scoped to 0.0.1, and the same statement moves those
--    rows to 0.1.0 — so a second run matches nothing and cannot walk the anchor
--    on to s-7.
--
--    endorsements is deliberately NOT re-pointed: endorsing v0.0.1 is a
--    statement about that version's text, not about v0.1.0's, and the table is
--    unique on (signer_id, base_version_id) so re-pointing could collide.
WITH "tgt" AS (
  SELECT "id" FROM "versions" WHERE "version" = '0.1.0' AND "is_current" LIMIT 1
),
"src" AS (
  SELECT "id" FROM "versions" WHERE "version" = '0.0.1' LIMIT 1
),
"snap_comments" AS (
  INSERT INTO "comment_version_backup_0008" ("id", "base_version_id", "anchor_id")
  SELECT "id", "base_version_id", "anchor_id"
    FROM "comments"
   WHERE "base_version_id" = (SELECT "id" FROM "src")
     AND EXISTS (SELECT 1 FROM "tgt")
  ON CONFLICT ("id") DO NOTHING
),
"snap_proposed_edits" AS (
  INSERT INTO "proposed_edit_version_backup_0008" ("id", "base_version_id", "anchor_id")
  SELECT "id", "base_version_id", "target_anchor_id"
    FROM "proposed_edits"
   WHERE "base_version_id" = (SELECT "id" FROM "src")
     AND EXISTS (SELECT 1 FROM "tgt")
  ON CONFLICT ("id") DO NOTHING
),
"moved_comments" AS (
  UPDATE "comments"
     SET "base_version_id" = (SELECT "id" FROM "tgt"),
         "anchor_id" = CASE
           WHEN "anchor_id" = 'article-7-s-5' THEN 'article-7-s-6'
           ELSE "anchor_id"
         END
   WHERE "base_version_id" = (SELECT "id" FROM "src")
     AND EXISTS (SELECT 1 FROM "tgt")
  RETURNING 1
)
UPDATE "proposed_edits"
   SET "base_version_id" = (SELECT "id" FROM "tgt"),
       "target_anchor_id" = CASE
         WHEN "target_anchor_id" = 'article-7-s-5' THEN 'article-7-s-6'
         ELSE "target_anchor_id"
       END
 WHERE "base_version_id" = (SELECT "id" FROM "src")
   AND EXISTS (SELECT 1 FROM "tgt");
