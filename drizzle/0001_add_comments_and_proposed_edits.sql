CREATE TABLE "comment_upvotes" (
	"comment_id" uuid NOT NULL,
	"signer_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"base_version_id" uuid NOT NULL,
	"anchor_id" text,
	"proposal_id" uuid,
	"signer_id" uuid NOT NULL,
	"body" text NOT NULL,
	"parent_comment_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"hidden_at" timestamp with time zone,
	"hidden_reason" text
);
--> statement-breakpoint
CREATE TABLE "endorsements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"signer_id" uuid NOT NULL,
	"base_version_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"converted_to_version_id" uuid,
	"converted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "proposal_upvotes" (
	"proposal_id" uuid NOT NULL,
	"signer_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proposed_edits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"base_version_id" uuid NOT NULL,
	"proposer_signer_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"target_anchor_id" text NOT NULL,
	"new_text" text,
	"rationale" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by" uuid,
	"published_in_version_id" uuid
);
--> statement-breakpoint
ALTER TABLE "signers" ADD COLUMN "notification_preference" text DEFAULT 'major' NOT NULL;--> statement-breakpoint
ALTER TABLE "comment_upvotes" ADD CONSTRAINT "comment_upvotes_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_upvotes" ADD CONSTRAINT "comment_upvotes_signer_id_signers_id_fk" FOREIGN KEY ("signer_id") REFERENCES "public"."signers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_base_version_id_versions_id_fk" FOREIGN KEY ("base_version_id") REFERENCES "public"."versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_proposal_id_proposed_edits_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposed_edits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_signer_id_signers_id_fk" FOREIGN KEY ("signer_id") REFERENCES "public"."signers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_comment_id_comments_id_fk" FOREIGN KEY ("parent_comment_id") REFERENCES "public"."comments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "endorsements" ADD CONSTRAINT "endorsements_signer_id_signers_id_fk" FOREIGN KEY ("signer_id") REFERENCES "public"."signers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "endorsements" ADD CONSTRAINT "endorsements_base_version_id_versions_id_fk" FOREIGN KEY ("base_version_id") REFERENCES "public"."versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "endorsements" ADD CONSTRAINT "endorsements_converted_to_version_id_versions_id_fk" FOREIGN KEY ("converted_to_version_id") REFERENCES "public"."versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_upvotes" ADD CONSTRAINT "proposal_upvotes_proposal_id_proposed_edits_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposed_edits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_upvotes" ADD CONSTRAINT "proposal_upvotes_signer_id_signers_id_fk" FOREIGN KEY ("signer_id") REFERENCES "public"."signers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposed_edits" ADD CONSTRAINT "proposed_edits_base_version_id_versions_id_fk" FOREIGN KEY ("base_version_id") REFERENCES "public"."versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposed_edits" ADD CONSTRAINT "proposed_edits_proposer_signer_id_signers_id_fk" FOREIGN KEY ("proposer_signer_id") REFERENCES "public"."signers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposed_edits" ADD CONSTRAINT "proposed_edits_decided_by_signers_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."signers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposed_edits" ADD CONSTRAINT "proposed_edits_published_in_version_id_versions_id_fk" FOREIGN KEY ("published_in_version_id") REFERENCES "public"."versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "comment_upvotes_comment_signer_unique" ON "comment_upvotes" USING btree ("comment_id","signer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "endorsements_signer_base_unique" ON "endorsements" USING btree ("signer_id","base_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "proposal_upvotes_proposal_signer_unique" ON "proposal_upvotes" USING btree ("proposal_id","signer_id");