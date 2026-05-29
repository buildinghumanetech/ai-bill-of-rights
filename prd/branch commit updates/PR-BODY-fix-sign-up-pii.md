# Right-size sign-up PII protection (remove performative security)

## What this is

A security review of how the app stores sign-up PII produced an initial set of
fixes. A follow-up "is this proportionate?" pass found that some of them were
**performative** (bypassable controls that add ops surface without protecting a
low-traffic advocacy site) and that the app **over-collected** PII. This PR is
the **minimal correct** change set: it keeps the fixes that address a real
problem and removes the rest. Net change is a reduction (~−140 lines).

> **Reviewers:** the branch history adds-then-removes some controls. Please
> **squash on merge** so the net diff is one coherent change.

## Kept (addresses a real problem)

- **Anonymizing revocation** (`revoke.ts`). Revoke no longer hard-deletes the
  signer/signature (which broke the consent-text promise *and* threw FK
  violations for anyone who had commented/voted/endorsed). It anonymizes in
  place. Reordered to be **fail-safe** under Neon's HTTP driver (no
  transactions): scrub public identity first, null `captured_fields` next,
  delete selfie rows/blobs last (the only irreversible step). Signature-less
  accounts are labelled **"Anonymized account"** (no ordinal) to avoid colliding
  with the genuine first signer.
- **Selfie blob cleanup** on reject / report-hide / self-removal / revoke — a
  rejected or removed face must not linger in public storage.
- **Attestation field validation** (length caps, email format, `http(s)` URL),
  extracted as a pure, unit-tested `validateAttestationFields()`. Framed as
  data-quality input hygiene, not security.
- **Admin "remove signer" UX**: corrected the false confirm copy (it described a
  hard delete; it anonymizes), and `deleteSignerAction`/`setAdminFlagAction` now
  return `{success, error?}` so the client can surface failures (Next redacts
  *thrown* server-action messages in prod).
- **Dependency CVE overrides** (`pnpm-workspace.yaml`: js-cookie ≥3.0.6,
  postcss ≥8.5.10).

## Removed (performative or over-collection)

- **Attestation IP rate-limit, entirely** — XFF-spoofable, and the verify email
  goes to *admins* (the publication gate already protects them), so it didn't
  protect the asset it claimed to. Dropped the `submitter_ip_hash` column, the
  IP hash, the header parse, and the throttle. (`enforce.ts` stays — still used
  by comments / comment-votes.)
- **Open admin self-bootstrap + last-admin guard** — "any signer self-promotes
  when no admin exists" is a standing foot-gun; the guard only existed to paper
  over it. First admin is now seeded by a one-off SQL `UPDATE` (see Deploy).
- **Over-collected PII**: stopped storing raw first/last names (the masked
  display name is enough), `user_agent_raw` + `device_type` (no consumer), and
  the full-resolution selfie **original** blob (only display + thumbnail are
  derived and stored now).

## Deploy / operational notes

- **`pnpm db:push` — review the diff before confirming.** This PR removes 4
  columns from the schema: `selfies.original_blob_url/original_mime/original_bytes`
  and `attestations.submitter_ip_hash`. `submitter_ip_hash` was only ever in code
  (added in `55109b3`, never pushed), so it won't exist anywhere. The selfie
  `original_*` columns are *pre-existing* (from the selfie feature, commit
  `1a02591`), so **whether `db:push` drops them depends on prod's actual state** —
  on a fresh dev branch it reported *"No changes detected,"* but confirm against
  prod. If `db:push` proposes dropping the selfie `original_*` columns, that's the
  intended change (accept the prompt). Use `db:push`, not `db:generate` (stale
  journal).
- **Confirm ≥1 admin exists in prod before deploy** (the bootstrap UI is gone).
  To seed/grant admin going forward:
  `UPDATE signers SET is_admin = true WHERE clerk_user_id = '<clerk id>';`
- **Optional one-time cleanup** (not required for correctness): orphaned selfie
  *original* blobs in Vercel storage; and stripping
  `raw_first_name`/`raw_last_name`/`user_agent_raw`/`device_type` keys from
  existing `consent_records.captured_fields`.

## Deferred (documented, not built here)

- **Attestation submitter verification** — the honest fix for anonymous-submit
  inbox flooding is to email the *submitter* to verify their own address before
  notifying admins (a flow change), not a bypassable IP throttle. Follow-up.
- **Clerk retains email/phone** on revoke (not purged) — document/decide later.
- No privacy policy / sub-processor (Clerk/Neon/Vercel/Resend) disclosure.
- drizzle CVE-2026-39356 is not reachable (no untrusted input into SQL
  identifiers/aliases); esbuild/vite advisories are dev-only.

## Two bugs caught by a live smoke (against a real Neon branch)

A manual smoke against a live Neon dev branch + Clerk surfaced two issues that
the offline checks (vitest-on-pglite, `tsc`) structurally could not:

1. **`"use server"` build failure.** The extracted `validateAttestationFields`
   was a *synchronous* export in the `"use server"` actions file, which Next
   forbids ("Server Actions must be async") — it would have failed the
   production build. vitest imports the function directly and `tsc` doesn't
   enforce the rule, so nothing offline saw it. **Fixed:** moved the pure
   validator to a plain module, `src/lib/attestations/validate.ts`.
2. **"Anonymized signer #0" — off-by-one in `getSignatureNumber`** (pre-existing;
   also affects the post-sign confirmation email + OG card on prod today). It
   read the signer's `signedAt` into a JS `Date` (millisecond precision) and
   counted `signed_at <= $param`; Postgres `timestamptz` keeps microseconds, so
   the signer's own row failed the boundary and the count came back one short.
   pglite round-trips at ms precision, masking it. **Fixed:** the comparison now
   stays entirely in SQL (no JS round-trip) — verified live on neon-http
   (returns the correct 1-based number) + a regression test.

## Testing

- `tsc --noEmit` clean. Full vitest: **198/198 pass.**
- The duplicate-report idempotency tests (`reportSelfie` / `reportComment`,
  pre-existing from commit `1a02591`) are **intermittently flaky** — they depend
  on how pglite surfaces a unique-violation in the swallow-`catch`. Not from this
  PR; flagged as a follow-up (make the catch robust to drizzle's wrapped error).
- New/updated tests: `validateAttestationFields` branch coverage; "Anonymized
  account" for signature-less signers; `getSignatureNumber` is 1-based; selfie
  now stores **2** blobs not 3.
- **Live-smoke verified:** attestation submit wiring; sign → name on
  `/signatories`; `captured_fields` contains **no** raw names / UA / device;
  revoke → name anonymized + location/affiliation cleared + `captured_fields`
  nulled; the `getSignatureNumber` fix returns the correct number on real Neon.
