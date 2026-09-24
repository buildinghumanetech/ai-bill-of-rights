-- Record every address the invite form has ever emailed, so that no address is
-- invited twice — by the same signer or by anyone else, ever.
--
-- sendInvitationsAction (src/server/actions/invite.ts) used to email whatever
-- list it was handed and record nothing, so the same friend could be invited
-- by every signer who knew them, and by one signer as often as they liked. The
-- action now claims each address with
--   INSERT ... ON CONFLICT (email_hash) DO NOTHING RETURNING
-- and only sends when that insert returned a row. The UNIQUE constraint on
-- email_hash is what makes that race-safe; it is the whole point of the table.
--
-- The raw address is NOT stored — only the sha256 hex of the trimmed,
-- lowercased address. The invitee never consented to us keeping it.
-- inviter_signer_id is ON DELETE SET NULL: deleting an inviter must neither be
-- blocked by these rows nor forget that the address was already invited.
--
-- The code that reads and writes this table ships with the same deploy, and
-- without the table every invitation fails, so apply this BEFORE deploying.
-- Idempotent by construction — see AGENTS.md: migrations here are applied by
-- hand and re-running one is normal. (No DO $$ block: the apply script's
-- statement splitter does not handle them.)

CREATE TABLE IF NOT EXISTS "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_hash" text NOT NULL,
	"inviter_signer_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_email_hash_unique" UNIQUE("email_hash"),
	CONSTRAINT "invitations_inviter_signer_id_signers_id_fk" FOREIGN KEY ("inviter_signer_id") REFERENCES "public"."signers"("id") ON DELETE set null ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invitations_inviter_signer_id_idx" ON "invitations" USING btree ("inviter_signer_id");
