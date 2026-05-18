# Branch Progress: feat/phase-2-as-code-attestations

## Progress Update as of 2026-05-18 16:45 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Plan 2 Task 10: Created admin review queue at `/admin/attestations`. Added `/admin(.*)` to `isProtectedRoute` in `src/proxy.ts` so Clerk middleware requires authentication for all admin routes. Created `src/app/admin/attestations/page.tsx` with dual-layer authorization: Clerk for authentication, `signers.is_admin` DB check for admin role. Page lists `listPendingReviewAttestations` results in amber cards with Approve and Hide (false claim) form actions. Both server actions re-check `is_admin` before calling `approveAttestation`/`hideAttestation`. Smoke test: curl to `/admin/attestations` returns 307 (Clerk redirect to sign-in for unauthenticated requests). TypeScript clean. All 39 tests pass.

### Detail of changes made:
- `src/proxy.ts`: Added `"/admin(.*)"` to the `isProtectedRoute` matcher array — Clerk now requires a valid session for any `/admin/...` path before the request reaches Next.js.
- `src/app/admin/attestations/page.tsx`: New async page. Dual auth: Clerk `auth()` check + `signers.is_admin` DB lookup. Renders "Not authorized" UI if the signed-in user is not an admin (rather than a redirect, so admins can share the URL without confusion). Fetches `listPendingReviewAttestations()` and maps rows to amber review cards. Each card shows org name, product name, version, contact email, product URL, claimed date, and email-verified date. Two inline `"use server"` form actions (`approveFormAction`, `hideFormAction`) each repeat the `is_admin` check before delegating to `approveAttestation`/`hideAttestation`, then redirect back to `/admin/attestations`.

### Potential concerns to address:
- None; implementation complete and tested.

---

## Progress Update as of 2026-05-18 16:36 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Plan 2 Task 9: Created the email-verification landing page at `src/app/attestations/verify/[token]/page.tsx`. This page handles the three outcomes of verification: (1) published (attestation auto-published because not flagged), (2) review (email confirmed but awaiting manual admin review), and (3) error (invalid/expired token). The page calls `verifyAttestationToken` which is already implemented. Renders centered UI with appropriate messaging and optional "See all attestations" CTA. Smoke test: curl to `/attestations/verify/badtoken` returns 200. All 39 tests pass; TypeScript clean.

### Detail of changes made:
- `src/app/attestations/verify/[token]/page.tsx`: New async page component. Accepts `[token]` dynamic route parameter. Calls `verifyAttestationToken` from existing server actions. Maps boolean `published` + `needsManualReview` into three outcome states. Renders three UI branches: success (published), pending-review, and error. All content centered, responsive, with dark-mode support via Tailwind classes.

### Potential concerns to address:
- None; implementation is complete and tested.

---

## Progress Update as of 2026-05-18 16:29 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Plan 2 Task 8: Created the public `/attestations` page and `AttestationCard` component. The page displays a paginated list (50 per page) of published attestations. Users can optionally filter by version via `?version={version}` query parameter. The `AttestationCard` component renders product name, org name, product URL (if available), and attestation date. Smoke test: curl to `/attestations` returns 200. All 39 tests pass; TypeScript clean.

### Detail of changes made:
- `src/components/AttestationCard.tsx`: New component. Accepts an `AttestationListItem`. Renders product name (bold), org name (muted), optional product URL (link), and attestation date in ISO format.
- `src/app/attestations/page.tsx`: New page. Accepts optional `?version` and `?page` query parameters. Calls `listPublishedAttestations` with limit=50 and pagination offset. Renders empty state if no attestations match. Renders "Next page" button if full page returned (indicates more results). Constructs next-page link preserving version filter.

### Potential concerns to address:
- None; implementation is complete and tested.

### Detail of changes made:
- `src/components/AsCodeButton.tsx`: New component. Renders a ghost pill-button linking to `/v/${version}/as-code`.
- `src/components/AttestationForm.tsx`: New component. Server-component form with a `handleSubmit` inline server action that delegates to `submitAttestationAction` (wrapping to satisfy `void` return-type constraint). Collects orgName, productName, productUrl, contactEmail, and hidden version field.
- `src/app/v/[version]/as-code/page.tsx`: New page. Validates version with `^\d+\.\d+\.\d+$`, checks file existence, reads agents.md from disk for preview. Tool-tab query param (`?tool=claude-code|cursor|copilot|generic`) controls the `saveAsName` filename in download and curl commands. Renders download buttons for agents.md and spec.json, curl one-liner, markdown preview, and `AttestationForm`.
- `src/app/v/[version]/page.tsx`: Added `AsCodeButton` import; updated sticky CTA `div` from `flex justify-center` to `flex flex-wrap justify-center gap-3` and added `<AsCodeButton version={row.version} />` alongside `<SignButton />`.
- `src/app/page.tsx`: Added third `<Link>` ("Building AI? Implement this in your code →") pointing to `/v/${versionString}/as-code` in the landing page CTA group.

### Potential concerns to address:
- `AttestationForm` uses an inline `"use server"` wrapper because `submitAttestationAction` returns `{ ok, id, needsManualReview }` rather than `void`. The wrapper drops the return value to satisfy the `form action` prop type. Could alternatively change `submitAttestationAction` to return `void`, but that would require touching the server action and its tests.

---

## Progress Update as of 2026-05-18 16:12 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Plan 2 Task 6: Created two raw file routes for serving versioned content files. `src/app/v/[version]/agents.md/route.ts` serves markdown files from disk with `text/markdown` content type. `src/app/v/[version]/spec.json/route.ts` serves JSON files with `application/json` content type. Both routes enforce semantic versioning validation (`^\d+\.\d+\.\d+$`), check file existence, and return 404 if invalid version or missing file. Verified with curl: agents.md returns 200 + text/markdown; spec.json returns 200 + application/json; bad version returns 404.

### Detail of changes made:
- `src/app/v/[version]/agents.md/route.ts`: GET handler that reads `content/bill-of-rights/v{version}.agents.md` from disk, validates version format, returns 404 if invalid/missing, serves with text/markdown content-type and 60-second cache-control header.
- `src/app/v/[version]/spec.json/route.ts`: GET handler that reads `content/bill-of-rights/v{version}.spec.json` from disk, validates version format, returns 404 if invalid/missing, serves with application/json content-type and 60-second cache-control header.

### Potential concerns to address:
- None; routes tested and working as expected.

---

## Progress Update as of 2026-05-18 16:11 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Plan 2 Task 5: Added `listPublishedAttestations` and `listPendingReviewAttestations` query helpers plus the `AttestationListItem` interface to `src/lib/db/queries.ts`. Added 3 test cases covering published-only filtering, version-string filtering, and the pending-review queue. All 39 tests pass; TypeScript is clean.

### Detail of changes made:
- `src/lib/db/queries.ts`: Merged `and`, `isNull`, `isNotNull` into the existing drizzle-orm import; added `attestations` to the schema import. Appended `AttestationListItem` interface, `listPublishedAttestations` (filters `published=true`, `hidden_at IS NULL`, optional `versionString` join), and `listPendingReviewAttestations` (filters `needs_manual_review=true`, `email_verified_at IS NOT NULL`, `manually_reviewed_at IS NULL`, `hidden_at IS NULL`). Both use the existing `getDefaultDb()` lazy pattern.
- `tests/lib/db.queries.attestations.test.ts`: 3 test cases. `listPublishedAttestations` returns only verified/published rows (Beta's unverified row excluded), filters correctly by version string (hit returns 1, miss returns 0). `listPendingReviewAttestations` returns the OpenAI row after email verification (frontier-lab flag keeps it unpublished, but it appears in the review queue).

### Potential concerns to address:
- None; purely additive. 39/39 tests pass, TypeScript clean.

---

## Progress Update as of 2026-05-18 16:09 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Plan 2 Task 4: Implemented attestation server actions (`createAttestation`, `verifyAttestationToken`, `approveAttestation`, `hideAttestation`, `submitAttestationAction`) and added the `attestationVerifyEmail` email template. Followed TDD: wrote 6 test cases first (confirmed FAIL), then wrote implementation, confirmed 36/36 tests pass.

### Detail of changes made:
- `tests/server/attestations.test.ts`: 6 test cases covering `createAttestation` (inserts with token, flags frontier-lab org names), `verifyAttestationToken` (publishes unflagged, keeps flagged unpublished, throws on unknown token), `approveAttestation` (sets `published=true`, `manually_approved=true`, `manually_reviewed_at`), and `hideAttestation` (sets `hidden_at`).
- `src/server/actions/attestations.ts`: All 5 exported functions. Uses the lazy `getDb()` pattern. `createAttestation` resolves version by string, calls `needsManualReview` from the allowlist, generates a token via `generateVerificationToken`. `verifyAttestationToken` gates publishing on the `needsManualReview` flag. `submitAttestationAction` is a `FormData`-based server action that calls `createAttestation` then fire-and-forgets the verification email. The `hideAttestation` reason parameter is intentionally not persisted (MVP — Vercel logs are the audit trail).
- `src/lib/email/templates.ts`: Added `attestationVerifyEmail` function returning subject + text body with the verify URL. Consistent with the existing `signConfirmation` export in the same file.

### Potential concerns to address:
- None; all 36 tests pass with no regressions. Email send is wrapped in try/catch so a send failure does not surface as a 500 to the user.

---

## Progress Update as of 2026-05-18 15:57 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Plan 2 Task 3: Created frontier-lab allowlist (`needsManualReview` function) and verification-token helper (`generateVerificationToken` function). Implemented using test-driven development: wrote 4 test cases covering exact name matching (case-insensitive), word-boundary matching in longer strings, filtering unrelated names, and substring detection. All 4 allowlist tests pass. Ran full test suite — all 29 tests pass with no regressions.

### Detail of changes made:
- `tests/lib/attestations.allowlist.test.ts`: 4 test cases using vitest. Tests verify the `needsManualReview` function correctly identifies frontier AI labs by word boundaries, handles case-insensitive matching, filters unrelated organizations, and treats mentions as substrings (conservative approach erring toward false-positives for admin review).
- `src/lib/attestations/allowlist.ts`: Exports `FRONTIER_LAB_NAMES` array (17 entries: openai, anthropic, google, deepmind, google deepmind, meta, amazon, microsoft, apple, mistral, xai, x.ai, cohere, perplexity, inflection, stability, stability ai). `needsManualReview(orgName: string): boolean` uses word-boundary regex to match org names, erring toward false-positives as a safety-first approach.
- `src/lib/attestations/token.ts`: Exports `generateVerificationToken(): string` function that generates a UUID and removes hyphens for use as an opaque, single-use verification token stored on `attestations.verification_token` (UNIQUE column).

### Potential concerns to address:
- None; implementation is complete and tested.

---

## Progress Update as of 2026-05-18 15:56 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Plan 2 Task 2: Generated the `attestations` migration using `pnpm db:generate`. Generated migration file: `drizzle/0001_brainy_hulk.sql`. Verified the SQL contains only the `CREATE TABLE attestations` DDL and the foreign key constraint to `versions.id` — no destructive changes to existing tables. Applied the migration to Neon dev DB using `pnpm db:push`. Migration completed successfully.

### Detail of changes made:
- `drizzle/0001_brainy_hulk.sql`: New migration file created by drizzle-kit. Contains CREATE TABLE for attestations with 14 columns and a UNIQUE constraint on `verification_token`. Also includes ALTER TABLE to add the FK constraint to `versions(id)`. No DROP or ALTER statements affecting existing tables.
- `drizzle/meta/_journal.json`: Updated with new entry for migration 0001 (tag: "0001_brainy_hulk").
- `drizzle/meta/0001_snapshot.json`: New snapshot file capturing the current schema state after the migration.
- Neon dev DB: Migration successfully applied. All 5 tables now present (versions, signers, signatures, consent_records, attestations).

### Potential concerns to address:
- None; migration is pure additive. Ready to proceed with Phase 2 server actions and UI work.

---

## Progress Update as of 2026-05-18 16:00 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Plan 2 Task 1: added the `attestations` table to the Drizzle schema and the pglite test helper DDL. Updated the schema test to assert all current tables including `attestations`. All 25 tests pass (9 test files).

### Detail of changes made:
- `src/lib/db/schema.ts`: appended `export const attestations = pgTable("attestations", {...})` after `signatures`. Columns: `id`, `org_name`, `product_name`, `product_url`, `version_id` (FK to `versions.id`), `contact_email`, `verification_token` (unique), `claimed_at`, `email_verified_at`, `needs_manual_review`, `manually_reviewed_at`, `manually_approved`, `published`, `hidden_at`. No existing tables were touched.
- `tests/_helpers/pglite-db.ts`: appended `create table attestations (...)` DDL and a partial index `attestations_version_published on attestations(version_id) where published = true` inside the existing `client.exec(...)` call (matches the method chosen in Plan 1 Task 6 fix for multi-statement strings).
- `tests/lib/db.schema.test.ts`: renamed test from "exports all Phase 1 tables" to "exports all current tables" and added `expect(schema.attestations).toBeDefined()`.

### Potential concerns to address:
- No concerns introduced in this task; purely additive schema change with no migration applied to any live DB yet.

---

## Progress Update as of 2026-05-18 15:45 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
First entry. Branched off `feat/phase-1-signable-mvp` at SHA `fb74a69`. Wrote Phase 2 implementation plan at `docs/superpowers/plans/2026-05-18-phase-2-as-code-attestations.md`. 11 TDD tasks covering: attestations table + migration, frontier-lab allowlist, server actions (create / verify / approve / hide), email-confirmation flow, raw-file routes for `/v/[version]/agents.md` and `/v/[version]/spec.json`, the `/v/[version]/as-code` page with tool tabs + downloads + attestation form, public `/attestations` page, verify landing page, and admin review queue at `/admin/attestations` (Clerk + `signers.is_admin` gated).

### Detail of changes made:
- Plan saved; covers Section 9 of the design spec end-to-end.
- Architecture: opaque UUID verification token stored on `attestations.verification_token`, no JWT signing. Simpler and good enough for email-link verification.
- Frontier-lab gate uses a word-boundary regex against an allowlist of known names. Erring toward false-positives (e.g., "We use OpenAI's API" gates for review) — admin override is the safety valve, and the cost of a false negative is far higher than the cost of a delay.
- Raw markdown/JSON files are streamed from disk (`content/bill-of-rights/v{X.Y.Z}.agents.md|.spec.json`), with a `^\d+\.\d+\.\d+$` regex guard against path traversal. The cached `versions` row stores parsed JSON for the document, not the raw agents.md/spec.json, so disk is the source.
- Admin actions are `"use server"` functions defined inside the page file with explicit `is_admin` checks. Could be hoisted into `src/server/actions/admin.ts` if we add more admin surface later.
- Branches off Phase 1, so depends on its merge. PR will note the stacking.

### Potential concerns to address:
- `hideAttestation` accepts a `reason` parameter but doesn't persist it. Acceptable for MVP — git log of the admin action via Vercel logs is the audit trail. Add `attestation_hide_log` table if a real paper trail is required.
- The admin role assignment has no UI in this plan — `signers.is_admin` must be flipped via direct SQL or psql/Neon console for now. Acceptable since the only admin in MVP is Erika herself.
- The "review queue" doesn't paginate. Acceptable until we have hundreds of pending flagged attestations.
- No rate limiting on attestation submissions. A single hostile actor could spam attestations for every version. Mitigation: the verify-email gate requires real email accounts.

---
