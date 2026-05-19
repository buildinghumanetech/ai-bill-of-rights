-- Adds selfies + selfie_reports tables plus the partial-unique active-approved
-- index. Drizzle 0.36's partial-unique index API is fragile, so the partial
-- unique is hand-written here — same trade-off as versions.is_current in
-- src/lib/db/schema.ts.

CREATE TABLE "selfies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "signer_id" uuid NOT NULL,
  "status" text NOT NULL,
  "original_blob_url" text NOT NULL,
  "display_blob_url" text NOT NULL,
  "thumbnail_blob_url" text NOT NULL,
  "original_mime" text NOT NULL,
  "original_bytes" integer NOT NULL,
  "capture_method" text NOT NULL,
  "submitted_at" timestamp with time zone NOT NULL DEFAULT now(),
  "reviewed_at" timestamp with time zone,
  "reviewed_by" uuid,
  "rejection_reason" text,
  "rejection_note" text,
  "auto_hidden_at" timestamp with time zone,
  "removed_at" timestamp with time zone,
  "replaced_by_selfie_id" uuid,
  CONSTRAINT "selfies_signer_id_signers_id_fk"
    FOREIGN KEY ("signer_id") REFERENCES "signers"("id"),
  CONSTRAINT "selfies_status_check"
    CHECK ("status" IN ('pending','approved','rejected','auto_hidden','removed')),
  CONSTRAINT "selfies_capture_method_check"
    CHECK ("capture_method" IN ('live','upload'))
);

CREATE INDEX "selfies_signer_id_idx" ON "selfies" ("signer_id");

CREATE UNIQUE INDEX "selfies_signer_active_unique"
  ON "selfies" ("signer_id")
  WHERE "status" = 'approved'
    AND "auto_hidden_at" IS NULL
    AND "removed_at" IS NULL
    AND "replaced_by_selfie_id" IS NULL;

CREATE INDEX "selfies_status_submitted_at_idx"
  ON "selfies" ("status", "submitted_at" DESC)
  WHERE "status" = 'pending';

CREATE TABLE "selfie_reports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "selfie_id" uuid NOT NULL,
  "reporter_signer_id" uuid NOT NULL,
  "reason" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "resolved_at" timestamp with time zone,
  "resolved_by" uuid,
  "resolution" text,
  CONSTRAINT "selfie_reports_selfie_id_selfies_id_fk"
    FOREIGN KEY ("selfie_id") REFERENCES "selfies"("id"),
  CONSTRAINT "selfie_reports_reporter_signer_id_signers_id_fk"
    FOREIGN KEY ("reporter_signer_id") REFERENCES "signers"("id"),
  CONSTRAINT "selfie_reports_resolution_check"
    CHECK ("resolution" IS NULL OR "resolution" IN ('allowed','hidden'))
);

CREATE UNIQUE INDEX "selfie_reports_selfie_reporter_unique"
  ON "selfie_reports" ("selfie_id", "reporter_signer_id");

CREATE INDEX "selfie_reports_selfie_unresolved_idx"
  ON "selfie_reports" ("selfie_id")
  WHERE "resolved_at" IS NULL;
