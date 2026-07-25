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
-- to wording that changed under it.
--
-- ORDERING: run this AFTER sync-versions has created the v0.1.0 row (it runs
-- on postbuild). Both statements are no-ops if v0.1.0 is missing or if there
-- is nothing left on v0.0.1, so this file is safe to re-run.

UPDATE "comments"
   SET "base_version_id" = (SELECT "id" FROM "versions" WHERE "version" = '0.1.0')
 WHERE "base_version_id" = (SELECT "id" FROM "versions" WHERE "version" = '0.0.1')
   AND EXISTS (SELECT 1 FROM "versions" WHERE "version" = '0.1.0');
--> statement-breakpoint
-- proposed_edits is scoped the same way. It has no rows today (the feature is
-- schema-only), but keeping the two in step avoids a surprise if that changes.
--
-- endorsements is deliberately NOT re-pointed: endorsing v0.0.1 is a statement
-- about that version's text, not about v0.1.0's, and the table is unique on
-- (signer_id, base_version_id) so re-pointing could collide anyway.
UPDATE "proposed_edits"
   SET "base_version_id" = (SELECT "id" FROM "versions" WHERE "version" = '0.1.0')
 WHERE "base_version_id" = (SELECT "id" FROM "versions" WHERE "version" = '0.0.1')
   AND EXISTS (SELECT 1 FROM "versions" WHERE "version" = '0.1.0');
