-- "Why I signed" statement + share attribution.
ALTER TABLE "signers" ADD COLUMN IF NOT EXISTS "why_i_signed" text;
ALTER TABLE "signers" ADD COLUMN IF NOT EXISTS "referred_by_signer_id" uuid;

DO $$ BEGIN
  ALTER TABLE "signers"
    ADD CONSTRAINT "signers_referred_by_signer_id_signers_id_fk"
    FOREIGN KEY ("referred_by_signer_id") REFERENCES "signers"("id")
    ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "signers_referred_by_idx"
  ON "signers" ("referred_by_signer_id");
