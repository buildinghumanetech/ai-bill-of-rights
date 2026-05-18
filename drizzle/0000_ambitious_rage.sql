CREATE TABLE "consent_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"signer_id" uuid NOT NULL,
	"consented_at" timestamp with time zone DEFAULT now() NOT NULL,
	"consent_text_hash" text NOT NULL,
	"captured_fields" jsonb,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "signatures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"signer_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"signed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version_hash_at_signing" text NOT NULL,
	"consent_record_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"display_name" text NOT NULL,
	"affiliation" text,
	"location_text" text,
	"verification_method" text NOT NULL,
	"verified_at" timestamp with time zone NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"soft_banned_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "signers_clerk_user_id_unique" UNIQUE("clerk_user_id")
);
--> statement-breakpoint
CREATE TABLE "versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" text NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"markdown_hash" text NOT NULL,
	"agents_md_hash" text NOT NULL,
	"spec_json_hash" text NOT NULL,
	"parsed_json" jsonb NOT NULL,
	"is_current" boolean DEFAULT false NOT NULL,
	"git_commit_sha" text,
	"is_user_fork" boolean DEFAULT false NOT NULL,
	"parent_version_id" uuid
);
--> statement-breakpoint
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_signer_id_signers_id_fk" FOREIGN KEY ("signer_id") REFERENCES "public"."signers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signatures" ADD CONSTRAINT "signatures_signer_id_signers_id_fk" FOREIGN KEY ("signer_id") REFERENCES "public"."signers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signatures" ADD CONSTRAINT "signatures_version_id_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signatures" ADD CONSTRAINT "signatures_consent_record_id_consent_records_id_fk" FOREIGN KEY ("consent_record_id") REFERENCES "public"."consent_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "signatures_signer_version_unique" ON "signatures" USING btree ("signer_id","version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "versions_version_unique" ON "versions" USING btree ("version");