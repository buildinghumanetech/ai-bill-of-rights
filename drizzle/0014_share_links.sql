-- Short share links: theaibill.org/s/<slug> → /signatories/<id>?ref=<id>.
--
-- Suggested share messages used to carry the signer's raw uuid twice (in the
-- path and in ?ref=). Each signer now gets one random slug, created the first
-- time their share view or confirmation email needs it
-- (src/lib/share/short-links.ts); the /s/[slug] route redirects to the long
-- signer URL with ref/via, so proxy.ts sets the attribution cookie exactly as
-- before.
--
-- A separate table, not a column on `signers`, on purpose: several code paths
-- select every signers column, so an unapplied column there breaks signing
-- (0007 did). If this table is missing, the short-link code logs and falls
-- back to the long link — sharing degrades, signing does not.
--
-- Slugs are random, never derived from a name (display names may be masked).
-- signer_id is UNIQUE (one slug per signer) and ON DELETE CASCADE (a deleted
-- signer's link stops resolving).
--
-- Apply BEFORE deploying the code that ships with it, alongside 0013.
-- Idempotent by construction — see AGENTS.md: migrations here are applied by
-- hand and re-running one is normal. (No DO $$ block: the apply script's
-- statement splitter does not handle them.)

CREATE TABLE IF NOT EXISTS "share_links" (
	"slug" text PRIMARY KEY NOT NULL,
	"signer_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "share_links_signer_id_unique" UNIQUE("signer_id"),
	CONSTRAINT "share_links_signer_id_signers_id_fk" FOREIGN KEY ("signer_id") REFERENCES "public"."signers"("id") ON DELETE cascade ON UPDATE no action
);
