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
-- HOW THIS ACTUALLY REACHES A DATABASE
--
-- `drizzle-kit push` does, and it is the only thing that does. push reconciles
-- the database against src/lib/db/schema.ts and never reads this directory, so
-- schema.ts is what has to be right — it declares
-- `.references(..., { onDelete: "set null" })` on referredBySignerId, and
-- tests/lib/db.signers-referral-columns.test.ts pins that by building a real
-- Postgres from schema.ts and asserting pg_constraint.confdeltype = 'n'.
--
-- `drizzle-kit migrate` does NOT apply this file, and the earlier claim in this
-- header that it did was wrong. drizzle/meta/_journal.json stops at 0004 and
-- the snapshots stop at 0001, so 0005-0008 are unregistered and migrate skips
-- them silently. Registering them would mean hand-authoring snapshot files to
-- describe a database whose real history was written by push — a fiction that
-- would rot the first time schema.ts changed. So this file is deliberately a
-- record of intent, not a step in a migration chain: it documents the change
-- and gives anyone rebuilding a database by hand (or repairing one that push
-- declined to touch) a correct, idempotent script to run. Do not assume it has
-- run anywhere.

DO $$
DECLARE
  constraint_name text;
BEGIN
  -- Find the FK by what it does rather than by name: drizzle-kit names it
  -- "signers_referred_by_signer_id_signers_id_fk", while a database created
  -- from inline DDL gets Postgres's default "signers_referred_by_signer_id_fkey".
  --
  -- Loop rather than take the first match: a database carrying BOTH historical
  -- names on this column is the exact drift this file exists to repair, and
  -- dropping only one would leave the survivor to collide with the ADD below.
  FOR constraint_name IN
    SELECT con.conname
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
  LOOP
    EXECUTE format('ALTER TABLE "signers" DROP CONSTRAINT %I', constraint_name);
  END LOOP;

  -- Belt and braces, the way 0007 does it: if some constraint we did not match
  -- already owns the name, do not abort the transaction.
  BEGIN
    ALTER TABLE "signers"
      ADD CONSTRAINT "signers_referred_by_signer_id_signers_id_fk"
      FOREIGN KEY ("referred_by_signer_id") REFERENCES "public"."signers"("id")
      ON DELETE SET NULL ON UPDATE no action;
  EXCEPTION
    WHEN duplicate_object THEN null;
  END;
END $$;
