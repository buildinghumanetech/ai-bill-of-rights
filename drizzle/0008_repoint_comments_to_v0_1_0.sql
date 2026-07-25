-- Carry the existing discussion forward from v0.0.1 to v0.1.0.
--
-- WHY: comments are scoped to the version row they were written against
-- (comments.base_version_id), and the homepage queries filter on the CURRENT
-- version. Publishing v0.1.0 therefore hides every existing thread on / and
-- /proposed. Articles 1-9 are unchanged in v0.1.0 and Articles 10-11 were
-- appended, so every existing anchor id still resolves — only the version
-- scoping needs moving.
--
-- TRADEOFF (decided deliberately): re-pointing loses the record of which
-- version's text each comment was written against. Since Articles 1-9 are
-- textually identical between the two versions, no comment ends up attached
-- to wording that changed under it. The backup tables below preserve the
-- original mapping so the move is reversible — see README for the down SQL.
--
-- ORDERING: run this AFTER sync-versions has created the v0.1.0 row AND made
-- it current (sync-versions runs on postbuild). The update targets
-- `version = '0.1.0' AND is_current`, so running it out of order — or after a
-- later version has already taken over as current — is a no-op rather than a
-- move onto a non-current version, which would leave threads hidden AND
-- destroy the original scoping. Safe to re-run.

-- 1. Preserve the original mapping so this is reversible. IF NOT EXISTS means
--    a re-run will not overwrite the first run's snapshot with a now-empty set.
CREATE TABLE IF NOT EXISTS "comment_version_backup_0008" AS
SELECT "id", "base_version_id"
  FROM "comments"
 WHERE "base_version_id" = (SELECT "id" FROM "versions" WHERE "version" = '0.0.1');
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "proposed_edit_version_backup_0008" AS
SELECT "id", "base_version_id"
  FROM "proposed_edits"
 WHERE "base_version_id" = (SELECT "id" FROM "versions" WHERE "version" = '0.0.1');
--> statement-breakpoint
-- 2. Move both tables in a SINGLE statement. scripts/apply-migration.ts sends
--    each statement as its own request (neon serverless HTTP — one implicit
--    transaction per call), so two separate UPDATEs could leave the two tables
--    in different version scopes if the second failed. A data-modifying CTE
--    keeps them atomic.
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
