CREATE TABLE "comment_votes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "comment_id" uuid NOT NULL,
  "signer_id" uuid NOT NULL,
  "direction" smallint NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "comment_votes" ADD CONSTRAINT "comment_votes_comment_id_comments_id_fk"
  FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "comment_votes" ADD CONSTRAINT "comment_votes_signer_id_signers_id_fk"
  FOREIGN KEY ("signer_id") REFERENCES "public"."signers"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "comment_votes_comment_signer_unique" ON "comment_votes" USING btree ("comment_id","signer_id");
--> statement-breakpoint
CREATE TABLE "comment_reports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "comment_id" uuid NOT NULL,
  "reporter_signer_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "resolved_at" timestamp with time zone,
  "resolved_by" uuid
);
--> statement-breakpoint
ALTER TABLE "comment_reports" ADD CONSTRAINT "comment_reports_comment_id_comments_id_fk"
  FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "comment_reports" ADD CONSTRAINT "comment_reports_reporter_signer_id_signers_id_fk"
  FOREIGN KEY ("reporter_signer_id") REFERENCES "public"."signers"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "comment_reports" ADD CONSTRAINT "comment_reports_resolved_by_signers_id_fk"
  FOREIGN KEY ("resolved_by") REFERENCES "public"."signers"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "comment_reports_comment_reporter_unique" ON "comment_reports" USING btree ("comment_id","reporter_signer_id");
