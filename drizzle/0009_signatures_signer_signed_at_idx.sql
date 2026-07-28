-- Supports the DISTINCT ON (signer_id) ... ORDER BY signer_id, signed_at DESC
-- scan behind listSignatures (/signers and /signatories, both force-dynamic),
-- and the earlier-signature NOT EXISTS probe in listRecentSignersSince.
--
-- The only pre-existing index on signatures is the (signer_id, version_id)
-- unique — it leads with signer_id but carries no signed_at, so neither sort
-- could be satisfied by an index scan.
CREATE INDEX IF NOT EXISTS "signatures_signer_signed_at_idx"
  ON "signatures" USING btree ("signer_id", "signed_at" DESC);
--> statement-breakpoint
-- The ticker (listRecentSignersSince, behind /api/signers/recent) is driven by
-- `signed_at > cutoff` with NO signer_id restriction, so the index above — which
-- leads with signer_id — cannot serve it. That endpoint is force-dynamic and
-- polled about once a minute by every open homepage tab, making it the hottest
-- of these query shapes; without this it scans all of signatures every time.
CREATE INDEX IF NOT EXISTS "signatures_signed_at_idx"
  ON "signatures" USING btree ("signed_at" DESC);
