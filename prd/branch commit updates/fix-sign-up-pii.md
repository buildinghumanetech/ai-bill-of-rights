# Branch Progress: fix/sign-up-pii

## Progress Update as of [2026-05-29 13:15 Pacific]
*(Most recent updates at top)*

### Summary of changes since last update
First entry. Branch addresses sign-up-flow PII findings from a security review:
makes account revocation actually honor the consent text (anonymize, not a
broken hard-delete), deletes selfie blobs on moderation/removal, locks down the
anonymous attestation endpoint, guards against removing the last admin, and
clears two dependency CVEs via pnpm overrides. All work done in an isolated
worktree branched from `main`; full suite green (193 tests), typecheck clean.

### Detail of changes made:
- **Fix A — anonymizing revocation (`src/server/actions/revoke.ts`).** Replaced
  `deleteSigner` with `anonymizeSigner`. It no longer deletes the signer/
  signature rows (the old hard-delete broke the consent promise AND threw FK
  violations for anyone with comment_votes/comment_reports/comment_mentions/
  endorsements/proposal_upvotes/proposed_edits rows). Now it: deletes selfie
  blobs + rows, nulls `consent_records.captured_fields` and stamps `revoked_at`,
  and renames the signer to `Anonymized signer #N` (N = `getSignatureNumber`)
  with affiliation/location nulled and `is_admin=false`. Signatures/comments/
  votes are retained under the anonymized name. `submitRevokeAction` and admin
  `deleteSignerAction` both route through it.
- **Fix B — selfie blob deletion (`src/server/actions/selfie.ts`).** `rejectSelfie`
  and `resolveSelfieReports("hidden")` now delete all three blobs;
  `removeMySelfie` now also deletes the original (the disclaimer promises removal
  — previously the original was kept). `src/app/account/page.tsx` nulls the
  rejected-card thumbnail since its blob is now gone. (We kept public Blob
  storage — the selfie disclaimer explicitly says photos are shown publicly;
  private storage was deferred, see concerns.)
- **Fix C — attestation hardening (`src/server/actions/attestations.ts`,
  `schema.ts`).** `submitAttestationAction` (anonymous by design) now validates
  field lengths + email format + `http(s)` product URL, and enforces a per-IP
  rate limit (5/hr) keyed on a SHA-256 hash of the submitter IP. New nullable
  column `attestations.submitter_ip_hash` (also added to the pglite test DDL).
- **Fix D — last-admin guard (`src/server/actions/admin.ts`).** New exported
  `assertNotLastAdmin`; `setAdminFlagAction(false)` and `deleteSignerAction`
  refuse to drop the admin count to zero (which would reopen the self-promote
  bootstrap path to any signer).
- **Fix E — dependency CVEs (`pnpm-workspace.yaml`).** Overrides for
  `js-cookie >=3.0.6` (Clerk transitive, high) and `postcss >=8.5.10` (Next
  transitive). Overrides live in `pnpm-workspace.yaml` because pnpm 11 no longer
  reads `pnpm.overrides` from package.json.
- **Tests:** rewrote `revoke.test.ts` for anonymize semantics (incl. FK-safety
  with comment-system rows); added `admin.last-admin-guard.test.ts`; added
  selfie blob-deletion assertions; added attestation IP-hash + rate-limit tests.
  `vitest.config.ts` gained an env-driven `cacheDir` (harmless default).

### Potential concerns to address:
- **DB migration via `db:push` only.** The `submitter_ip_hash` column must be
  applied with `pnpm db:push` at deploy (prod Neon + preview branches). Do NOT
  `pnpm db:generate` — the repo's drizzle journal/snapshots are stale (stop at
  0004 while `.sql` files go to 0006), so generate emits a bogus full-schema
  migration. pglite tests already include the column.
- **drizzle-orm <0.45.2 (high, CVE-2026-39356) left unpatched — deliberate.**
  Not reachable here (no `sql.identifier()`/`.as()`/dynamic-sort with untrusted
  input; the lone `sql.raw` passes an escaped value). The fix only exists in the
  breaking 0.45 RQBv2 release; schedule that upgrade separately.
- **esbuild/vite advisories (moderate) left unpatched — deliberate.** Dev-only
  (vitest tooling), never in the production bundle.
- **Selfie privacy residual.** Approved selfies are intentionally public (per the
  disclaimer). The full-res original of an approved selfie + pending/un-reviewed
  uploads remain public-by-obscurity. Closing that fully = migrate to Vercel
  Blob private storage + signed URLs (originals + pending first) — deferred.
- **No privacy policy enumerates sub-processors** (Clerk/Neon/Vercel/Resend) or
  the `captured_fields` PII; worth adding given the app's explicit "we don't
  share" promises.

---
