# Branch Progress: fix/sign-up-pii

## Progress Update as of [2026-05-29 19:45 Pacific]
*(Most recent updates at top)*

### Summary of changes since last update
Ran a live Chrome smoke against a real Neon dev branch + keyless Clerk, which
caught **two bugs the offline checks (vitest-on-pglite, tsc) structurally could
not** — both now fixed with regression tests. Also relocated the attestation
validator out of the `"use server"` file. Full suite **198/198 green**, tsc
clean.

### Detail of changes made:
- **Fix: `"use server"` build failure.** `validateAttestationFields` was a sync
  export in `src/server/actions/attestations.ts` (a `"use server"` file) — Next
  requires every export there to be an async action, so the production build
  would fail. vitest imports it directly and tsc doesn't enforce the rule, so it
  passed offline. Moved the pure validator to **new `src/lib/attestations/validate.ts`**;
  `attestations.ts` and the test import it from there. `MAX_TEXT`/`MAX_URL` moved
  with it; `EMAIL_RE` still shared via `src/lib/validation/input.ts`.
- **Fix: "Anonymized signer #0" off-by-one in `getSignatureNumber`**
  (`src/lib/db/queries.ts`). It read `signedAt` into a JS `Date` (ms precision)
  then counted `signed_at <= $param`; Postgres `timestamptz` keeps microseconds,
  so the signer's own row failed the boundary → count one short. pglite masks it
  (ms round-trip). Rewrote so the comparison stays **entirely in SQL** (subquery,
  no JS round-trip). Pre-existing bug; also affects the post-sign confirmation
  email ("You're Signer #N", `templates.ts`) and OG card on prod. Added a
  `getSignatureNumber` regression test (1-based, in sign order). Documented intent
  confirmed 1-based: spec `…design.md:311` ("global sequence number"), plan test
  expects `#42`, function's own `?? 1` fallbacks.
- **KISS follow-through (from prior agent review):** also confirmed inlining of
  `deleteSelfieBlobsByUrls` (dropped the `deleteSelfieBlobsForRows` wrapper) and
  keeping `MAX_TEXT` local — both already in the tree.

### Live-smoke results (Neon dev branch):
- `/attestations` + as-code submit form render against real DB; attestation
  submit wiring works.
- Sign → name renders on `/signatories`; `consent_records.captured_fields`
  confirmed to contain **no** `raw_first_name`/`raw_last_name`/`user_agent_raw`/
  `device_type` (the one PII claim only a live run could verify).
- Revoke → display_name anonymized, location + affiliation cleared,
  `captured_fields` nulled.
- `getSignatureNumber` fix verified on neon-http (count query returns correct
  1-based number; old JS-roundtrip path returned 0).

### Potential concerns to address (this update):
- The existing anonymized test row keeps the name "Anonymized signer #0" (baked
  in at revoke time before the fix). The fix applies to future revokes/displays,
  not retroactively — not a code issue.
- Duplicate-report idempotency tests (`reportSelfie`/`reportComment`) are
  **flaky** (pre-existing, commit `1a02591`) — pass/fail by how pglite surfaces
  the unique-violation in the swallow-`catch`. Follow-up: make the catch robust
  to drizzle's wrapped error shape. Out of scope here.

---

## Progress Update as of [2026-05-29 17:45 Pacific]
*(Most recent updates at top)*

### Summary of changes since last update
KISS restructuring that **reverses parts of the prior commit (`55109b3`)** after a
max-effort review flagged performative controls + PII over-collection. Net diff
vs `main` is now leaner (≈ −140 lines). Removed the attestation IP rate-limit
entirely, the open admin self-bootstrap, and the last-admin guard; stopped
storing raw names / `user_agent_raw` / `device_type` / the selfie *original*
blob (drops 4 DB columns). Kept the genuinely-needed work (anonymizing revoke,
selfie blob cleanup, attestation field validation, CVE overrides). `tsc` clean;
194/196 tests pass — the 2 failures are **pre-existing on `main`** (commit
`1a02591`, the duplicate-report idempotency `catch` that drizzle 0.36's error
wrapping breaks), not introduced here. **Recommend squashing the branch at
push** since this work adds-then-removes parts of `55109b3`.

### Detail of changes made:
- **Removed attestation IP rate-limit (performative).** `attestations.ts`: dropped
  the `headers()`/XFF parse, `sha256Hex(ip)`, `enforceRateLimit` call + `countSql`,
  `ATTESTATION_MAX_PER_HOUR`, and `CreateAttestationInput.submitterIpHash`. Dropped
  the `attestations.submitter_ip_hash` column (schema + pglite DDL). The control was
  XFF-spoofable and the verify email goes to *admins* (publication gate already
  protects them). `enforce.ts` stays (still used by comments + comment-votes). The
  honest fix (email the submitter to verify their own address before notifying
  admins) is documented as a follow-up, not built here.
- **Removed open admin bootstrap + last-admin guard.** Deleted `bootstrapAdminAction`,
  `assertNotLastAdmin`, and the `no-admins-yet` state (`check.ts` union + count
  branch + `admin/signers/page.tsx` form). Narrowed `requireAdminOrBootstrap` →
  `requireAdmin` (`state==="admin"` only) at all callers; simplified `adminSigner`
  derivation. First admin is now seeded by a one-off SQL `UPDATE` (documented),
  closing the silent self-promote path entirely.
- **Data minimization.** `sign-from-modal.ts`: stopped storing `raw_first_name`/
  `raw_last_name` (kept `name_display_format`). `fingerprint/extract.ts`: dropped
  `user_agent_raw` + `device_type` from `CapturedFields` (no consumer; kept
  `ip_geo_region` — it builds the public `locationText`).
- **Selfie original blob no longer persisted.** `blob.ts` `uploadSelfieBlobs` uploads
  only display + thumbnail; `UploadedSelfieBlobs`/`deleteSelfieBlobsByUrls` lost
  `originalUrl`; dropped `selfies.original_blob_url`/`original_mime`/`original_bytes`
  (schema + pglite). `processSelfieImage` still derives display/thumbnail from the
  in-memory original, which is then discarded. Eliminates the "removed face still
  fetchable" residual. Admin Rejected tab blanks the (now-404) display URL and the
  client renders a "Photo removed" placeholder.
- **Revoke reorder + label fix (`revoke.ts`).** `anonymizeSigner` now runs
  fail-safe under the no-transaction neon-http driver: scrub public identity FIRST
  (rename/blank/de-admin), then null `captured_fields`, then delete selfie
  rows/blobs LAST (the only irreversible step). Signature-less signers get the
  label **"Anonymized account"** (no ordinal) instead of colliding with the
  genuine first signer via `getSignatureNumber`'s `1` fallback.
- **Attestation validation kept + made testable.** Extracted pure
  `validateAttestationFields()` (length caps, email, `http(s)` URL — reframed as
  data-quality, not security; React 19 already neutralizes `javascript:` hrefs).
  Shared only `EMAIL_RE` via new `src/lib/validation/input.ts` (imported by
  `attestations.ts` + `contact.ts`); `MAX_TEXT` stayed local to `attestations.ts`.
- **Admin "remove signer" UX (`AdminRowActions.tsx`, `admin.ts`).** Fixed the false
  confirm copy ("permanently removes signatures…" → describes anonymization).
  `deleteSignerAction`/`setAdminFlagAction` now return `{success,error?}` (matching
  siblings) and the client surfaces the error (Next redacts *thrown* server-action
  messages in prod; returned results survive).
- **KISS verification pass (2 read-only agents).** Confirmed no correctness bugs.
  Acted on both simplification findings: inlined `deleteSelfieBlobsByUrls` at its
  call sites (dropped the one-purpose `deleteSelfieBlobsForRows` wrapper) and kept
  `MAX_TEXT` local rather than in the shared module.

### Potential concerns to address (this update):
- **`pnpm db:push` DROPS 4 columns** (`selfies.original_blob_url`/`original_mime`/
  `original_bytes`, `attestations.submitter_ip_hash`). db:push prompts on drops —
  confirm. Do NOT `db:generate` (stale journal). pglite DDL already mirrors the
  final shape.
- **Confirm ≥1 admin exists in prod before deploy** — the bootstrap UI is gone.
  Future admin seeding: `UPDATE signers SET is_admin=true WHERE clerk_user_id=…`.
- **Orphaned data** (optional one-time cleanup): existing selfie *original* blobs in
  Vercel storage; `captured_fields` keys `raw_first_name`/`raw_last_name`/
  `user_agent_raw`/`device_type` on old rows.
- **2 pre-existing test failures** remain red (duplicate-report idempotency in
  `reportSelfie`/`reportComment`) — they fail identically on `main`; out of scope
  for this PR. Flag if CI must be fully green.

---

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
