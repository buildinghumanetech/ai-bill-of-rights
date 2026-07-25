-- Referral attribution must not block account deletion.
--
-- 0007 created signers.referred_by_signer_id with ON DELETE no action, so
-- Postgres refused (SQLSTATE 23503) to delete any signer who had referred
-- someone — self-service deletion, revoke and admin delete were all broken for
-- exactly the people who successfully shared the site. None of those paths
-- clears the referring rows first, so the constraint itself has to give way.
--
-- SET NULL, not CASCADE: attribution is a historical fact about how someone
-- arrived, so it is the right thing to lose. CASCADE would delete real signers.
--
-- The deploy path is `drizzle-kit push`, which reconciles against
-- src/lib/db/schema.ts — that file is what actually has to be right. This
-- migration exists so the change is on the record and so a database migrated
-- with `drizzle-kit migrate` ends up in the same place. Idempotent: safe to
-- re-run.

DO $$
DECLARE
  constraint_name text;
BEGIN
  -- Find the FK by what it does rather than by name: drizzle-kit names it
  -- "signers_referred_by_signer_id_signers_id_fk", while a database created
  -- from inline DDL gets Postgres's default "signers_referred_by_signer_id_fkey".
  SELECT con.conname INTO constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE con.contype = 'f'
    AND nsp.nspname = 'public'
    AND rel.relname = 'signers'
    AND con.conkey = ARRAY[
      (SELECT attnum FROM pg_attribute
        WHERE attrelid = rel.oid AND attname = 'referred_by_signer_id')
    ]::smallint[]
  LIMIT 1;

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE "signers" DROP CONSTRAINT %I', constraint_name);
  END IF;

  ALTER TABLE "signers"
    ADD CONSTRAINT "signers_referred_by_signer_id_signers_id_fk"
    FOREIGN KEY ("referred_by_signer_id") REFERENCES "public"."signers"("id")
    ON DELETE SET NULL ON UPDATE no action;
END $$;
