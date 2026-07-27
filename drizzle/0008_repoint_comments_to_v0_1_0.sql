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
-- 1, 4, 5 and 7. The revisions break down into three cases:
--
--   (a) Sentences APPENDED at the end of an article (5 gained two; 11 is new).
--       Existing anchors are unaffected: article-5-s-1 still addresses the same
--       sentence, and nothing shifted underneath it.
--
--   (b) Text CHANGED in place, same position (article-1-s-4, article-4-s-1).
--       The anchor still resolves and still points at the same slot in the same
--       article, and in both cases the claim is unchanged and only sharper —
--       "The default is no." -> 'The default is "No LLM training on my data."',
--       and "persuasive dark patterns" -> "deceptive patterns". No comment ends
--       up beside a sentence that changed subject. Highlights degrade safely
--       regardless: the homepage matches comments.selected_text as a substring,
--       so a selection that no longer appears renders unhighlighted rather than
--       landing on the wrong words.
--
--       Articles 2 and 6 were revised in an earlier draft of this publish and
--       then deliberately reverted to their v0.0.1 wording, which is why they
--       are absent here. Article 6 in particular had been the one case where a
--       closing line changed subject; it no longer does.
--
--   (c) A sentence INSERTED MID-ARTICLE. Exactly one: v0.1.0 adds the COPPA
--       definition of a child to Article 7 as the new s-5, pushing "Children's
--       data is not a training asset." from s-5 to s-6. Left alone, every
--       comment on article-07-s-5 would silently re-attach from the sentence it
--       was written about to a definition nobody has read. So this migration
--       REMAPS article-07-s-5 -> article-07-s-6 for the rows it moves, keeping
--       each comment with its sentence. The original anchor is recorded in the
--       backup tables, so the remap reverses along with the move.
--
--       If a future version inserts mid-article again, this is the case to
--       handle — and it is invisible unless someone diffs sentence counts.
--
--   (d) RENAMED "Connects to" pills. Comments can be anchored to a pill, not
--       only to a sentence: HomepageArticles builds the anchor as
--       `article-NN-connect-<slug>`. v0.1.0 renames the HumaneBench pages to
--       the benchmark's own eight principle names (humanebench.ai/principles),
--       so those slugs change and the anchors change with them. Remapped below,
--       one branch per rename.
--
--       NOT remapped, deliberately: `article-06-connect-humanebench-principle-
--       empowerment`. Article 6's HumaneBench pill was REMOVED, not renamed —
--       there is no successor pill on that article to move a comment to, and
--       reattaching it to an unrelated principle would misrepresent what
--       someone said. It is recoverable from the backup if that is the wrong
--       call.
--
--       Note the PAGE and the PILL part ways here, and next.config.ts looks
--       like it contradicts this comment but does not. The page was renamed
--       (Empowerment -> Enhance Human Capabilities) and so gets a redirect,
--       because an old /resources/ URL that used to work should keep working.
--       The pill was removed from Article 6 outright, which is a different
--       fact about a different thing — hence a live redirect for the URL and
--       no anchor remap for the comment.
--
-- ARTICLE NUMBERS ARE ZERO-PADDED. Every anchor literal below uses `article-01`
-- … `article-09`, NOT `article-1`. The app builds anchors from
-- `article.number` (src/app/HomepageArticles.tsx:539,604), and that field has
-- been the two-digit string "01".."11" since the file was created — so
-- `article-7-s-5` matches no row that has ever existed. An earlier revision of
-- this migration used the unpadded form throughout, which made every remap
-- branch a silent no-op: the rows still moved to v0.1.0, the stale anchor still
-- "resolved", and nothing errored. The rename set itself is derived from
-- `git show main:src/app/HomepageArticles.tsx` vs HEAD rather than from the
-- working tree, so branches are not written for pills that never shipped.
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
           WHEN "anchor_id" = 'article-07-s-5' THEN 'article-07-s-6'
           WHEN "anchor_id" = 'article-01-connect-humanebench-principle-dignity'
             THEN 'article-01-connect-humanebench-principle-protect-dignity-and-safety'
           WHEN "anchor_id" = 'article-03-connect-humanebench-principle-honesty'
             THEN 'article-03-connect-humanebench-principle-be-transparent-and-honest'
           WHEN "anchor_id" = 'article-04-connect-humanebench-principle-non-manipulation'
             THEN 'article-04-connect-humanebench-principle-enable-meaningful-choices'
           WHEN "anchor_id" = 'article-05-connect-humanebench-principle-transparency'
             THEN 'article-05-connect-humanebench-principle-be-transparent-and-honest'
           WHEN "anchor_id" = 'article-09-connect-humanebench-respect-user-attention'
             THEN 'article-09-connect-humanebench-principle-respect-user-attention'
           ELSE "anchor_id"
         END
   WHERE "base_version_id" = (SELECT "id" FROM "src")
     AND EXISTS (SELECT 1 FROM "tgt")
  RETURNING 1
)
UPDATE "proposed_edits"
   SET "base_version_id" = (SELECT "id" FROM "tgt"),
       "target_anchor_id" = CASE
         WHEN "target_anchor_id" = 'article-07-s-5' THEN 'article-07-s-6'
         WHEN "target_anchor_id" = 'article-01-connect-humanebench-principle-dignity'
           THEN 'article-01-connect-humanebench-principle-protect-dignity-and-safety'
         WHEN "target_anchor_id" = 'article-03-connect-humanebench-principle-honesty'
           THEN 'article-03-connect-humanebench-principle-be-transparent-and-honest'
         WHEN "target_anchor_id" = 'article-04-connect-humanebench-principle-non-manipulation'
           THEN 'article-04-connect-humanebench-principle-enable-meaningful-choices'
         WHEN "target_anchor_id" = 'article-05-connect-humanebench-principle-transparency'
           THEN 'article-05-connect-humanebench-principle-be-transparent-and-honest'
         WHEN "target_anchor_id" = 'article-09-connect-humanebench-respect-user-attention'
           THEN 'article-09-connect-humanebench-principle-respect-user-attention'
         ELSE "target_anchor_id"
       END
 WHERE "base_version_id" = (SELECT "id" FROM "src")
   AND EXISTS (SELECT 1 FROM "tgt");
--> statement-breakpoint
-- 3. Repair rows that are ALREADY on v0.1.0 but still carry a pre-rename slug.
--
--    The move above is scoped `base_version_id = src`, so it cannot reach two
--    populations:
--
--      * Comments written on the /proposed tab against the v0.1.0 DRAFT while
--        the pills still had their old slugs — they were authored on the target
--        version, so they were never in scope of a src->tgt move.
--      * Any environment where an EARLIER form of this migration already ran.
--        0008 was revised several times on this branch; a dev database that
--        applied a previous form has its rows on 0.1.0 with anchors that the
--        earlier (unpadded, therefore no-op) CASE never touched.
--
--    Both leave an anchor pointing at a pill that no longer renders, and both
--    are silent. Matching on anchor value alone is safe and idempotent: these
--    old slugs are gone from the app, so a row carrying one is orphaned by
--    definition and there is nothing for a re-run to match a second time.
--
--    THE RENAME SET HERE IS WIDER THAN THE ONE ABOVE, and deliberately so.
--    The src->tgt move derives its set from `main` vs HEAD, because only a
--    pill that shipped on main can carry a v0.0.1 comment. That is the WRONG
--    test for this statement: the rows it targets were authored against the
--    v0.1.0 DRAFT, so they can be anchored to pills that only ever existed on
--    this branch. Four such renames landed between 293640f (the state the
--    preview served while /proposed was live) and 343918d — articles 07, 08,
--    10 and 11 — and none of them appear in the `main` diff. So this set is
--    `main` vs HEAD UNION 293640f vs HEAD.
--
--    article-06-connect-…-empowerment is again absent on purpose — see (d).
UPDATE "comments"
   SET "anchor_id" = CASE
         WHEN "anchor_id" = 'article-01-connect-humanebench-principle-dignity'
           THEN 'article-01-connect-humanebench-principle-protect-dignity-and-safety'
         WHEN "anchor_id" = 'article-03-connect-humanebench-principle-honesty'
           THEN 'article-03-connect-humanebench-principle-be-transparent-and-honest'
         WHEN "anchor_id" = 'article-04-connect-humanebench-principle-non-manipulation'
           THEN 'article-04-connect-humanebench-principle-enable-meaningful-choices'
         WHEN "anchor_id" = 'article-05-connect-humanebench-principle-transparency'
           THEN 'article-05-connect-humanebench-principle-be-transparent-and-honest'
         WHEN "anchor_id" = 'article-07-connect-humanebench-principle-dignity'
           THEN 'article-07-connect-humanebench-principle-protect-dignity-and-safety'
         WHEN "anchor_id" = 'article-08-connect-humanebench-principle-long-term-wellbeing'
           THEN 'article-08-connect-humanebench-principle-prioritize-long-term-wellbeing'
         WHEN "anchor_id" = 'article-09-connect-humanebench-respect-user-attention'
           THEN 'article-09-connect-humanebench-principle-respect-user-attention'
         WHEN "anchor_id" = 'article-10-connect-humanebench-principle-equity-inclusion'
           THEN 'article-10-connect-humanebench-principle-design-for-equity-and-inclusion'
         WHEN "anchor_id" = 'article-11-connect-humanebench-principle-dignity'
           THEN 'article-11-connect-humanebench-principle-protect-dignity-and-safety'
         ELSE "anchor_id"
       END
 WHERE "base_version_id" IN (
         SELECT "id" FROM "versions" WHERE "version" = '0.1.0' AND "is_current"
       )
   AND "anchor_id" IN (
         'article-01-connect-humanebench-principle-dignity',
         'article-03-connect-humanebench-principle-honesty',
         'article-04-connect-humanebench-principle-non-manipulation',
         'article-05-connect-humanebench-principle-transparency',
         'article-07-connect-humanebench-principle-dignity',
         'article-08-connect-humanebench-principle-long-term-wellbeing',
         'article-09-connect-humanebench-respect-user-attention',
         'article-10-connect-humanebench-principle-equity-inclusion',
         'article-11-connect-humanebench-principle-dignity'
       );
--> statement-breakpoint
UPDATE "proposed_edits"
   SET "target_anchor_id" = CASE
         WHEN "target_anchor_id" = 'article-01-connect-humanebench-principle-dignity'
           THEN 'article-01-connect-humanebench-principle-protect-dignity-and-safety'
         WHEN "target_anchor_id" = 'article-03-connect-humanebench-principle-honesty'
           THEN 'article-03-connect-humanebench-principle-be-transparent-and-honest'
         WHEN "target_anchor_id" = 'article-04-connect-humanebench-principle-non-manipulation'
           THEN 'article-04-connect-humanebench-principle-enable-meaningful-choices'
         WHEN "target_anchor_id" = 'article-05-connect-humanebench-principle-transparency'
           THEN 'article-05-connect-humanebench-principle-be-transparent-and-honest'
         WHEN "target_anchor_id" = 'article-07-connect-humanebench-principle-dignity'
           THEN 'article-07-connect-humanebench-principle-protect-dignity-and-safety'
         WHEN "target_anchor_id" = 'article-08-connect-humanebench-principle-long-term-wellbeing'
           THEN 'article-08-connect-humanebench-principle-prioritize-long-term-wellbeing'
         WHEN "target_anchor_id" = 'article-09-connect-humanebench-respect-user-attention'
           THEN 'article-09-connect-humanebench-principle-respect-user-attention'
         WHEN "target_anchor_id" = 'article-10-connect-humanebench-principle-equity-inclusion'
           THEN 'article-10-connect-humanebench-principle-design-for-equity-and-inclusion'
         WHEN "target_anchor_id" = 'article-11-connect-humanebench-principle-dignity'
           THEN 'article-11-connect-humanebench-principle-protect-dignity-and-safety'
         ELSE "target_anchor_id"
       END
 WHERE "base_version_id" IN (
         SELECT "id" FROM "versions" WHERE "version" = '0.1.0' AND "is_current"
       )
   AND "target_anchor_id" IN (
         'article-01-connect-humanebench-principle-dignity',
         'article-03-connect-humanebench-principle-honesty',
         'article-04-connect-humanebench-principle-non-manipulation',
         'article-05-connect-humanebench-principle-transparency',
         'article-07-connect-humanebench-principle-dignity',
         'article-08-connect-humanebench-principle-long-term-wellbeing',
         'article-09-connect-humanebench-respect-user-attention',
         'article-10-connect-humanebench-principle-equity-inclusion',
         'article-11-connect-humanebench-principle-dignity'
       );
