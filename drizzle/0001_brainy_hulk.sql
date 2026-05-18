CREATE TABLE "attestations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_name" text NOT NULL,
	"product_name" text NOT NULL,
	"product_url" text,
	"version_id" uuid NOT NULL,
	"contact_email" text NOT NULL,
	"verification_token" text NOT NULL,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"email_verified_at" timestamp with time zone,
	"needs_manual_review" boolean DEFAULT false NOT NULL,
	"manually_reviewed_at" timestamp with time zone,
	"manually_approved" boolean,
	"published" boolean DEFAULT false NOT NULL,
	"hidden_at" timestamp with time zone,
	CONSTRAINT "attestations_verification_token_unique" UNIQUE("verification_token")
);
--> statement-breakpoint
ALTER TABLE "attestations" ADD CONSTRAINT "attestations_version_id_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."versions"("id") ON DELETE no action ON UPDATE no action;