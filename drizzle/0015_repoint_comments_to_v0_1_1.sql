-- Carry the existing discussion forward from v0.1.0 to v0.1.1.
--
-- WHY: comments are scoped to the version row they were written against
-- (comments.base_version_id), and the homepage queries filter on the CURRENT
-- version. Publishing v0.1.1 therefore hides every existing thread on / and
-- /proposed until they are moved.
--
-- WHAT CHANGED IN v0.1.1: Article 12 was APPENDED. Articles 1 through 11 are
-- word for word identical, with the same sentence count, pull quotes and
-- "Connects to" pills, so every existing anchor still resolves to the same
-- text. No anchor is remapped; only base_version_id moves.
--
-- SIGNATURES are deliberately untouched. They stay on v0.1.0, which is the
-- record of what each person actually agreed to. Public counts are
-- version-agnostic, so nobody drops out of any count or list.
--
-- RUN AFTER the deploy, once `sync-versions` has created the v0.1.1 row and
-- marked it current. Before that the target CTE is empty and this is a no-op.
-- Safe to re-run: once rows have moved, the source set is empty.
--
-- ROLLBACK: the backup tables record each moved row's original version.
--   UPDATE "comments" AS c SET "base_version_id" = b."base_version_id"
--     FROM "comment_version_backup_0015" AS b WHERE c."id" = b."id";
--   UPDATE "proposed_edits" AS p SET "base_version_id" = b."base_version_id"
--     FROM "proposed_edit_version_backup_0015" AS b WHERE p."id" = b."id";
-- Run both in one transaction, and only if v0.1.0 is current again.

CREATE TABLE IF NOT EXISTS "comment_version_backup_0015" (
  "id" uuid PRIMARY KEY,
  "base_version_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "proposed_edit_version_backup_0015" (
  "id" uuid PRIMARY KEY,
  "base_version_id" uuid NOT NULL
);
--> statement-breakpoint
WITH "tgt" AS (
  SELECT "id" FROM "versions" WHERE "version" = '0.1.1' AND "is_current" LIMIT 1
),
"src" AS (
  SELECT "id" FROM "versions" WHERE "version" = '0.1.0' LIMIT 1
),
"snap_comments" AS (
  INSERT INTO "comment_version_backup_0015" ("id", "base_version_id")
  SELECT "id", "base_version_id"
    FROM "comments"
   WHERE "base_version_id" = (SELECT "id" FROM "src")
     AND EXISTS (SELECT 1 FROM "tgt")
  ON CONFLICT ("id") DO NOTHING
),
"snap_proposed_edits" AS (
  INSERT INTO "proposed_edit_version_backup_0015" ("id", "base_version_id")
  SELECT "id", "base_version_id"
    FROM "proposed_edits"
   WHERE "base_version_id" = (SELECT "id" FROM "src")
     AND EXISTS (SELECT 1 FROM "tgt")
  ON CONFLICT ("id") DO NOTHING
),
"moved_comments" AS (
  UPDATE "comments"
     SET "base_version_id" = (SELECT "id" FROM "tgt")
   WHERE "base_version_id" = (SELECT "id" FROM "src")
     AND EXISTS (SELECT 1 FROM "tgt")
  RETURNING 1
)
UPDATE "proposed_edits"
   SET "base_version_id" = (SELECT "id" FROM "tgt")
 WHERE "base_version_id" = (SELECT "id" FROM "src")
   AND EXISTS (SELECT 1 FROM "tgt");
