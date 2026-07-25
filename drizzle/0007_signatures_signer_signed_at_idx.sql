-- Supports the DISTINCT ON (signer_id) ... ORDER BY signer_id, signed_at DESC
-- scan behind listSignatures (/signers and /signatories, both force-dynamic),
-- and the earlier-signature NOT EXISTS probe in listRecentSignersSince.
--
-- The only pre-existing index on signatures is the (signer_id, version_id)
-- unique — it leads with signer_id but carries no signed_at, so neither sort
-- could be satisfied by an index scan.
CREATE INDEX IF NOT EXISTS "signatures_signer_signed_at_idx"
  ON "signatures" USING btree ("signer_id", "signed_at" DESC);
