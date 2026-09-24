-- Version emails: the one-time relaunch email and future version updates.
--
-- One row per (campaign, signer) ever emailed. The send script
-- (scripts/send-version-email.ts) inserts the row BEFORE sending and skips
-- anyone whose row already exists, so a rerun or a crash partway through can
-- never email the same signer twice for the same campaign.
-- `unsubscribe_token` is the random secret in that email's one-click
-- unsubscribe link (/unsubscribe/<token>), which sets the signer's
-- notification_preference to 'none'.
--
-- No email address is stored. signer_id is ON DELETE CASCADE, so deleting a
-- signer also forgets what they were sent.
--
-- A separate table that only the send script and the unsubscribe route read,
-- so if it is missing, signing is unaffected. Apply BEFORE the first real
-- send. Idempotent by construction (see AGENTS.md); no DO $$ block.

CREATE TABLE IF NOT EXISTS "email_sends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign" text NOT NULL,
	"signer_id" uuid NOT NULL,
	"unsubscribe_token" text NOT NULL,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "email_sends_unsubscribe_token_unique" UNIQUE("unsubscribe_token"),
	CONSTRAINT "email_sends_signer_id_signers_id_fk" FOREIGN KEY ("signer_id") REFERENCES "public"."signers"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "email_sends_campaign_signer_unique" ON "email_sends" USING btree ("campaign","signer_id");
