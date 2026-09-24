-- Proposals for an entirely new Article ("propose a new right").
--
-- Reuses `proposed_edits` rather than adding a table: a new-article proposal is
-- a proposed edit whose kind is `new_article`. Everything downstream of it —
-- the per-signer upvote uniqueness in `proposal_upvotes`, the polymorphic
-- `comments.proposal_id` thread, the pending/accepted/rejected/published
-- lifecycle, the version-scoping in `base_version_id` — already exists and
-- already works. A parallel table would have had to re-earn all of it.
--
-- `target_anchor_id` is NOT NULL and a new article has nothing to attach to, so
-- these rows carry the sentinel 'document-end'. Do not read that as an anchor
-- into the rendered document: no element emits it, and anchorTextMap() does not
-- know it. It means "after the last article", which is where an accepted
-- proposal is spliced in at publish time.
--
-- Idempotent by construction (IF NOT EXISTS on every statement; there is no
-- UPDATE) — see AGENTS.md: migrations here are applied by hand and re-running
-- one is normal.

ALTER TABLE "proposed_edits" ADD COLUMN IF NOT EXISTS "title" text;
--> statement-breakpoint
ALTER TABLE "proposed_edits" ADD COLUMN IF NOT EXISTS "pull_quote" text;
--> statement-breakpoint
-- Moderation, mirroring `comments`. A proposal is never hard-deleted: the
-- upvotes and the discussion thread hanging off it are other people's work.
ALTER TABLE "proposed_edits" ADD COLUMN IF NOT EXISTS "hidden_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "proposed_edits" ADD COLUMN IF NOT EXISTS "hidden_reason" text;
--> statement-breakpoint
-- Serves the public queue (/propose): kind + not-hidden, ordered by recency,
-- and the admin queue's status filter.
CREATE INDEX IF NOT EXISTS "proposed_edits_kind_created_idx"
  ON "proposed_edits" USING btree ("kind", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "proposed_edits_status_created_idx"
  ON "proposed_edits" USING btree ("status", "created_at" DESC);
--> statement-breakpoint
-- The queue's upvote-count aggregate groups by proposal_id. The existing unique
-- index leads with proposal_id too, so this is belt-and-braces for the plan
-- shape, and cheap.
CREATE INDEX IF NOT EXISTS "proposal_upvotes_proposal_idx"
  ON "proposal_upvotes" USING btree ("proposal_id");
