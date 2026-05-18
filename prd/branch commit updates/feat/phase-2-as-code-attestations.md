# Branch Progress: feat/phase-2-as-code-attestations

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
