# Sign-up PII: anonymizing revoke, selfie cleanup, and data minimization

## What this does

Improves how the app handles sign-up PII: revocation now anonymizes in place
instead of hard-deleting, selfie blobs are cleaned up when a photo is removed,
attestation input is validated, and the app stops storing data it never uses.

> This branch has interim commits; please **squash on merge** for a clean,
> single-commit history.

## Changes

- **Anonymizing revocation** (`revoke.ts`). The consent text
  (`content/consent/v1.md`) has always told signers that revoking *anonymizes*
  their signature in place — the signature remains and keeps counting, only the
  personal data is removed. The code didn't actually do that: it hard-deleted the
  signer/signature row, which contradicted that promise *and* threw foreign-key
  violations for anyone who had commented, voted, endorsed, or been @mentioned.
  This change brings the code in line with the promise the user already agreed to:
  the public entry becomes "Anonymized signer #N" and the private data is erased,
  while the signature itself is retained. Ordered to be **fail-safe** under Neon's
  HTTP driver (no transactions): scrub the public identity first, null
  `captured_fields` next, delete selfie rows/blobs last (the only irreversible
  step). Signature-less accounts get the label "Anonymized account" (no ordinal) so
  they can't collide with the genuine first signer.
- **Honest `/account/revoke` copy** (`account/revoke/page.tsx`). The old page
  claimed revoke would delete your signature, delete the consent record, and free
  your email/phone to re-sign — none of which it does. Rewrote it to match the
  actual behavior and the consent text: anonymize the public entry (signature still
  counts), erase the private captured fields (consent record kept as proof of what
  was agreed to), delete the photo.
- **Selfie blob cleanup** on reject / report-hide / self-removal / revoke — a
  rejected or removed face should not linger in public storage.
- **Attestation field validation** (length caps, email format, `http(s)` URL),
  extracted as a pure, unit-tested `validateAttestationFields()`.
- **Admin "remove signer" UX**: corrected the confirm copy (it described a hard
  delete; the action anonymizes), and `deleteSignerAction` / `setAdminFlagAction`
  now return `{success, error?}` so the client can surface failures (Next redacts
  *thrown* server-action messages in prod).
- **Data minimization**: stopped persisting the full-resolution selfie **original**
  blob (only the display + thumbnail variants are derived and stored now) and
  stopped writing unused capture fields (raw first/last name, raw user-agent,
  device type) into `consent_records.captured_fields`. Drops three now-unused
  `selfies` columns (see Deploy).
- **Admin provisioning** (`admin.ts`, `admin/signers/page.tsx`, `check.ts`).
  Replaced the in-app self-bootstrap path (any signer could promote themselves to
  the first admin while no admin existed) with explicit SQL seeding, and removed
  the accompanying last-admin guard that only existed to support it. Admin is now
  granted out-of-band — see Deploy. **Note for reviewers:** if you rely on the
  bootstrap screen in a fresh environment, use the SQL `UPDATE` below instead.
- **Dependency CVE overrides** (`pnpm-workspace.yaml`: js-cookie ≥3.0.6,
  postcss ≥8.5.10).

## Deploy / operational notes

- **`pnpm db:push` — review the diff before confirming.** This change drops three
  columns: `selfies.original_blob_url`, `original_mime`, `original_bytes`. They are
  pre-existing (from the selfie feature, commit `1a02591`), so `db:push` should
  propose dropping them against prod — that's intended; accept the prompt. Use
  `db:push`, not `db:generate` (stale journal).
- **Confirm at least one admin exists in prod before deploy** (the in-app
  bootstrap screen is gone). To grant admin now and going forward:
  `UPDATE signers SET is_admin = true WHERE clerk_user_id = '<clerk id>';`
- **Optional one-time cleanup** (not required for correctness): orphaned selfie
  *original* blobs in Vercel storage; and stripping any
  `raw_first_name` / `raw_last_name` / `user_agent_raw` / `device_type` keys from
  existing `consent_records.captured_fields`.

## Two bugs caught by a live smoke (against a real Neon branch)

A manual smoke against a live Neon dev branch + Clerk surfaced two issues that the
offline checks (vitest-on-pglite, `tsc`) structurally could not:

1. **`"use server"` build failure.** The extracted `validateAttestationFields` was
   a *synchronous* export in the `"use server"` actions file, which Next forbids
   ("Server Actions must be async") — it would have failed the production build.
   vitest imports the function directly and `tsc` doesn't enforce the rule, so
   nothing offline saw it. **Fixed:** moved the pure validator to a plain module,
   `src/lib/attestations/validate.ts`.
2. **"Anonymized signer #0" — off-by-one in `getSignatureNumber`** (pre-existing;
   also affects the post-sign confirmation email + OG card on prod today). It read
   the signer's `signedAt` into a JS `Date` (millisecond precision) and counted
   `signed_at <= $param`; Postgres `timestamptz` keeps microseconds, so the
   signer's own row failed the boundary and the count came back one short. pglite
   round-trips at ms precision, masking it. **Fixed:** the comparison now stays
   entirely in SQL (no JS round-trip) — verified live on neon-http and covered by a
   regression test.

## Testing

- `tsc --noEmit` clean. Full vitest: **198/198 pass.**
- New/updated tests: `validateAttestationFields` branch coverage; "Anonymized
  account" for signature-less signers; `getSignatureNumber` is 1-based; selfie now
  stores **2** blobs, not 3.
- The duplicate-report idempotency tests (`reportSelfie` / `reportComment`) are
  **intermittently flaky** — they depend on how the test DB surfaces a
  unique-violation in the swallow-`catch`. This is pre-existing (the catch logic is
  identical on `main`) and not from this change; flagged as a follow-up (make the
  catch robust to the driver's wrapped error: check `err.cause?.code` /
  `err.cause?.message`, not just `err.code` / `err.message`).
- **Live-smoke verified:** attestation submit wiring; sign → name on
  `/signatories`; `captured_fields` contains no raw names / UA / device; revoke →
  name anonymized + location/affiliation cleared + `captured_fields` nulled; the
  `getSignatureNumber` fix returns the correct number on real Neon.

## Known limitations / deferred

- **Clerk retains email/phone** on revoke (not purged) — documented; decide later.
- No privacy policy / sub-processor (Clerk / Neon / Vercel / Resend) disclosure.
- drizzle CVE-2026-39356 is not reachable (no untrusted input into SQL
  identifiers/aliases); esbuild/vite advisories are dev-only.
