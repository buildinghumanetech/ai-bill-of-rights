-- Record, per proposal, the licence its author granted when submitting it.
--
-- /propose now says, next to the submit button, that the proposed text is
-- licensed under CC BY 4.0. A notice on a page proves nothing about any given
-- row, because the page changes; so each row carries the terms it was filed
-- under, and when.
--
-- DELIBERATELY NO DEFAULT AND NO BACKFILL. Postgres fills a column added with a
-- DEFAULT into every existing row, which here would record a CC BY grant on
-- proposals whose authors were never shown one. NULL means "no licence grant
-- recorded" — that text cannot be republished without asking its author. The
-- application writes both columns explicitly, only from the flow that displays
-- the notice (src/server/proposals/core.ts).
--
-- Independent of 0011 (it touches only these two new columns), but the code
-- that writes them ships with the same deploy, so apply this BEFORE deploying.
-- Idempotent by construction — see AGENTS.md: migrations here are applied by
-- hand and re-running one is normal.

ALTER TABLE "proposed_edits" ADD COLUMN IF NOT EXISTS "license" text;
--> statement-breakpoint
ALTER TABLE "proposed_edits" ADD COLUMN IF NOT EXISTS "license_granted_at" timestamp with time zone;
