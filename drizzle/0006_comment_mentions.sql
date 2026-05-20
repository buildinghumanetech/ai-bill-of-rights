CREATE TABLE "comment_mentions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "comment_id" uuid NOT NULL,
  "mentioned_signer_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "comment_mentions" ADD CONSTRAINT "comment_mentions_comment_id_comments_id_fk"
  FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "comment_mentions" ADD CONSTRAINT "comment_mentions_mentioned_signer_id_signers_id_fk"
  FOREIGN KEY ("mentioned_signer_id") REFERENCES "public"."signers"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "comment_mentions_unique" ON "comment_mentions" USING btree ("comment_id","mentioned_signer_id");
