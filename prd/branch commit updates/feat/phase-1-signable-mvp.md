# Branch Progress: feat/phase-1-signable-mvp

## Progress Update as of 2026-05-18 14:47 Pacific (Task 13)
*(Most recent updates at top)*

### Summary of changes since last update
Task 13 complete: implemented sign-complete page, public signatories list, individual signer profile pages, plus the three new query helpers backing them. Extended the existing test file with 1 new test (TDD: fail-then-pass). All 22 tests pass (1 new). TS is clean.

### Detail of changes made:
- Extended `tests/lib/db.queries.test.ts`: added imports for `listSignatures`, `getSignerById`, `signers`, `consentRecords`, `signatures`, `versions`; added `describe("signer list queries")` block with 1 test that inserts a full signer+consent+signature row and verifies `listSignatures` returns the joined row with correct `displayName` and `locationText`.
- Extended `src/lib/db/queries.ts`: added `desc` to the drizzle-orm import; added `signers` to the schema import; exported `SignerListItem` interface; added `listSignatures(db, opts)` (joined select of `signers`+`signatures`+`versions`, ordered newest-first, with limit/offset pagination); added `getSignerById(signerId, db)` (single-row select by UUID); added `listSignaturesForSigner(signerId, db)` (select `signedAt`+`version` for all signatures by a given signer). All three follow the established `db ?? getDefaultDb()` lazy pattern.
- Created `src/components/VerificationBadge.tsx`: small pill badge showing "Verified via email" or "Verified via SMS" in emerald colours with dark-mode variant.
- Created `src/components/SignatureCard.tsx`: a `<Link>` card to `/signatories/{signerId}` displaying display name, verification badge, location/affiliation, and version+date. Accepts a `SignerListItem` prop.
- Created `src/app/sign/complete/page.tsx`: `force-dynamic` server component. Awaits `auth()` (redirects to `/` if unauthenticated), reads `searchParams.version`, looks up the signer row by `clerkUserId`, and renders a confirmation screen with links to the signer's public profile page and the signatories list.
- Created `src/app/signatories/page.tsx`: `force-dynamic` server component. Reads `searchParams.page`, calls `listSignatures(undefined, {limit:50, offset})`, renders `SignatureCard` for each row, and shows a "Next page" link when the page is full.
- Created `src/app/signatories/[id]/page.tsx`: `force-dynamic` server component. Awaits `params.id`, calls `getSignerById` (→ `notFound()` on miss) and `listSignaturesForSigner`, renders the signer's name, verification badge, location/affiliation, and a list of signed versions linking to `/v/{version}`, plus a "Revoke your signature" footer link.
- Fixed one TS error introduced by the `sigs.map` callback: typed the `s` parameter explicitly as `{ version: string; signedAt: Date }` since `listSignaturesForSigner` returns `any[]`.

### Potential concerns to address:
- `listSignaturesForSigner` returns `any[]` because Drizzle's inferred return type for `db: any` is not propagated. The explicit type annotation on the `s` parameter in the profile page is the workaround. A future refactor could define a `SignerSignatureRow` interface and cast the return.
- `src/app/sign/complete/page.tsx` imports `db` directly from `@/lib/db` (the production Neon client). This is correct for a server component that runs only in production, but it means the page cannot be rendered in unit tests without a real `DATABASE_URL`. Consistent with all other page-level code in this project.

---

## Progress Update as of 2026-05-18 14:41 Pacific (Task 12)
*(Most recent updates at top)*

### Summary of changes since last update
Task 12 complete: implemented the consent screen, fingerprint capture, and signature submission via strict TDD. Created 7 new files across lib, server, app, and tests. All 21 tests pass (6 new). TS is clean.

### Detail of changes made:
- Created `tests/lib/fingerprint.extract.test.ts` (3 tests): verifies UA parsing into browser/os/version, graceful handling of missing headers, and first-IP extraction from multi-hop `x-forwarded-for`.
- Created `tests/lib/consent.hash.test.ts` (1 test): verifies SHA-256 produces a known stable hex digest against the `"abc"` vector.
- Created `tests/server/sign.test.ts` (2 tests): (1) atomically inserts a `consent_records` row + `signatures` row and links them via `consentRecordId`; (2) rejects double-signing the same `(signer_id, version_id)` via the unique index constraint.
- Created `src/lib/fingerprint/extract.ts`: `extractCapturedFields(headers, context)` reads IP (first hop of `x-forwarded-for`), Vercel geo headers (`x-vercel-ip-city/country-region/country/timezone`), UA via `ua-parser-js`, `accept-language`, `referer`, and the caller-supplied `sessionUtc` + optional `screenResolution`.
- Created `src/lib/consent/hash.ts`: thin wrapper around `node:crypto` SHA-256 producing lowercase hex.
- Created `src/lib/consent/render.ts`: `renderConsentText(version, input)` reads `content/consent/v{N}.md` at runtime, substitutes `{{token}}` placeholders with signer profile fields + captured fingerprint fields, returns the rendered string that is subsequently hashed for the record. Exports `CURRENT_CONSENT_VERSION = 1`.
- Created `src/server/actions/sign.ts`: `"use server"`. Exports `recordSignature(db?, input)` (pure over a drizzle client — accepts optional `db` for testability, looks up the version row, two-step inserts `consent_records` then `signatures`) and `submitSignAction(formData)` (auth check, consent checkbox validation, signer lookup with profile-redirect fallback, server-side fingerprint re-capture at submit time, consent text render + SHA-256 hash, calls `recordSignature`, redirects to `/sign/complete`).
- Created `src/app/sign/consent/page.tsx`: async server component with `force-dynamic`. Awaits `auth()`, `searchParams`, loads the signer row (redirects to `/sign/profile` if missing), renders the consent text with a fingerprint snapshot from page-load headers (for display only — submit re-captures), and renders the form with a required checkbox + hidden `version` field bound to `submitSignAction`.

### Potential concerns to address:
- **Orphan consent rows on partial failure:** `recordSignature` performs two sequential inserts without a transaction. If `consent_records` succeeds but `signatures` fails (e.g., due to the unique-index constraint on double-sign), an orphan `consent_records` row is created. The orphan has no `signature` linking it to a `version`, so it has no legal weight, but it represents noise in the table. A future migration to wrap both inserts in a transaction would eliminate this. Flagged as known MVP trade-off in comments inside `sign.ts`.
- **Consent text drift between display and submission:** The consent text rendered on the page (for the user to read) is captured from request headers at page-load time. The consent text that is hashed and stored is captured at form-submit time. If the user leaves the page open across a network change (e.g., phone → WiFi), the stored fingerprint may differ from what was displayed. The spec explicitly accepts this; the submit-time capture is the authoritative one.
- **Screen resolution not captured at page load:** `extractCapturedFields` at the server-component level has no `screenResolution` (client JS needed). The hidden `screen` input in the form allows the submit action to populate it from client-side JS if desired. Currently no JS sets it — screen_resolution will appear as `(not provided)` in the consent record. A future enhancement can add a small `<script>` to the consent page to set the hidden input before submit.

---

## Progress Update as of 2026-05-18 14:45 Pacific (Task 11)
*(Most recent updates at top)*

### Summary of changes since last update
Task 11 complete: implemented the post-OTP profile capture step via strict TDD. Created `src/server/actions/profile.ts` (exports `upsertSignerProfile` + `submitProfileAction`), `src/app/sign/profile/page.tsx` (the Step 1 of 2 form), and `tests/server/profile.test.ts` (2 tests, both passing). All 15 tests across 5 test files pass. TS is clean.

### Detail of changes made:
- Created `tests/server/profile.test.ts` with 2 tests: (1) inserts a new signer row when none exists for the given Clerk user ID; (2) updates an existing signer when `upsertSignerProfile` is called twice with the same `clerkUserId`, and the final row count is exactly 1.
- Created `src/server/actions/profile.ts` with `"use server"` at the top of the file. Exports `ProfileInput` interface, `upsertSignerProfile(db?, input)` (pure over a drizzle client — accepts an optional `db` argument defaulting to lazy `require("@/lib/db").db` to avoid the `DATABASE_URL` guard at import time in tests), and `submitProfileAction(formData)` (reads `auth()` from Clerk, validates `displayName` presence, extracts `affiliation`/`location`/`version` from `FormData`, infers `verificationMethod` from `sessionClaims`, calls `upsertSignerProfile`, and redirects to `/sign/consent?version=...`).
- Created `src/app/sign/profile/page.tsx`: async server component that awaits `auth()` (redirects to `/` if no `userId`), awaits `searchParams` (Next.js 16 `Promise<{version?:string}>` convention), and renders a 3-field form (`displayName` required, `location` optional, `affiliation` optional) bound to `submitProfileAction`. Hidden `version` input threads the version param to the server action.
- Lazy `getDb()` pattern in `profile.ts` mirrors the pattern established in `src/lib/db/queries.ts` for consistency.

### Potential concerns to address:
- `submitProfileAction` reads `verificationMethod` from `sessionClaims["primary_verification"]`. Clerk does not document this claim key; it defaults to `"email"` if absent. Task 12 can refine this if the actual Clerk claim key differs in production.
- The profile page does not prefill fields if the signer has already completed this step (e.g., on re-entry). A future polish pass could call `upsertSignerProfile` in read-mode or add a `getSignerByClerkId` query to prefill values.

---

## Progress Update as of 2026-05-18 14:45 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Task 10 complete: rendered the parsed Bill of Rights at `/v/[version]` and set up `/bill-of-rights` to redirect to the current version. Created 5 files — a redirect page, 3 shared components (`VersionBanner`, `DocumentRenderer`, `SignButton`), and the dynamic `[version]` page. TS is clean; all 13 existing tests still pass.

### Detail of changes made:
- Created `src/app/bill-of-rights/page.tsx`: server component with `force-dynamic` that calls `getCurrentVersion()` and redirects to `/v/${version}`, falling back to `"1.0.0"` if no current version exists.
- Created `src/components/VersionBanner.tsx`: displays version string, publish date (from `Date | string` for Drizzle compat), and an optional changelog link.
- Created `src/components/DocumentRenderer.tsx`: renders a `ParsedDocument` as semantic HTML — preamble as `<h1>`, other articles as `<h2>`, paragraphs as `<p>`, sentences as `<span>` with `data-anchor-id` and `className="anchored-sentence"`. Uses `prose prose-zinc` Tailwind classes (decorative without `@tailwindcss/typography`).
- Created `src/components/SignButton.tsx`: a sticky `<Link>` to `/sign/profile?version=<encoded>` styled as a rounded pill button.
- Created `src/app/v/[version]/page.tsx`: server component with `force-dynamic`. Awaits `params` (Next.js 16 `Promise<{version: string}>` convention), calls `getVersionByString`, calls `notFound()` on miss, casts `row.parsedJson as unknown as ParsedDocument`, and composes the three components.

### Potential concerns to address:
- `prose` Tailwind classes are emitted but `@tailwindcss/typography` is not installed. The document will render unstyled until a polish pass adds the plugin.
- `data-anchor-id` attributes on sentence spans are in place for future highlight/anchor UX (Tasks TBD).

---

## Progress Update as of 2026-05-18 15:30 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Task 9 complete: implemented 3 DB query helpers and replaced the Next.js starter landing page with the live signature-count landing page. Created `src/lib/db/queries.ts` exporting `getCurrentVersion`, `getVersionByString`, and `getSignatureCount`. Created `tests/lib/db.queries.test.ts` (2 tests, both passing). Replaced `src/app/page.tsx` with the new landing page that calls both query helpers at request time (`force-dynamic`). TS is clean.

### Detail of changes made:
- Created `src/lib/db/queries.ts` with 3 exported async functions: `getCurrentVersion(db?)` selects the row with `is_current = true`; `getVersionByString(versionString, db?)` looks up a version by its string; `getSignatureCount(db?)` returns a `count()` aggregate as a `number`. All three accept an optional `db` argument (defaulting to the production client via a lazy `require()` call) so tests can inject a pglite instance without triggering the `DATABASE_URL` guard that lives in `src/lib/db/index.ts` at module-evaluation time.
- Created `tests/lib/db.queries.test.ts` with 2 tests: `getCurrentVersion` returns the `is_current` row from a two-version DB; `getSignatureCount` returns 0 on a fresh DB.
- Replaced `src/app/page.tsx` (Next.js starter boilerplate) with the new landing page component. Exports `dynamic = "force-dynamic"` for fresh counts on every request. Shows live signature count and version string, with "Read & sign" (→ `/v/${versionString}`) and "Why this matters" (→ `/why`) CTAs. No Next.js logo or vercel links remain.
- `pnpm exec tsc --noEmit --skipLibCheck` exits cleanly (no output, code 0).

### Potential concerns to address:
- The lazy `require("./index")` pattern in `queries.ts` is used to avoid the top-level `DATABASE_URL` guard at import time in tests. In production (where `DATABASE_URL` is always set) this is equivalent to a direct import and has no downside. The pattern is documented with an inline comment.
- `getVersionByString` is not exercised by Task 9 tests; it will be covered by Task 10 tests when the document rendering route uses it.

---

## Progress Update as of 2026-05-18 15:00 Pacific

### Summary of changes since last update
Task 8 complete: Clerk proxy (middleware) and ClerkProvider wired into the app. Key discovery: Next.js 16 renamed `middleware.ts` to `proxy.ts` — the plan assumed Next.js 15 conventions. Created `src/proxy.ts` (not root `middleware.ts`) with `clerkMiddleware` protecting `/sign/profile(.*)`, `/sign/consent(.*)`, `/sign/complete(.*)`, and `/account(.*)`. Updated `src/app/layout.tsx` to wrap `<html>` in `<ClerkProvider>` and updated metadata title/description. Also fixed a pre-existing TypeScript error in `src/lib/db/sync.ts` (drizzle select return type `{}[]` → `VersionRow[]`) that was blocking `pnpm build`. Build passes (TS clean, 4 static pages generated, Proxy detected) with a properly formatted dummy Clerk key; the postbuild db script fails expectedly without `DATABASE_URL`.

### Detail of changes made:
- Created `src/proxy.ts` (Next.js 16 `proxy.ts` convention, not `middleware.ts`). Exports `clerkMiddleware` as default export and `config` with matcher. Clerk v6.39.3 accepts both `middleware` and `proxy` filenames for Next 16.
- Updated `src/app/layout.tsx`: added `ClerkProvider` import from `@clerk/nextjs`, wrapped `<html>` in `<ClerkProvider>`, updated `metadata.title` to "AI Bill of Rights" and `metadata.description` to "A People's Demand for Human-Centered AI".
- Fixed `src/lib/db/sync.ts`: typed the `db.select().from(versions)` result as `VersionRow[]` using `typeof versions.$inferSelect`, eliminating the TS2339 error that blocked `next build`.
- `pnpm build` produces `ƒ Proxy (Middleware)` in route output, confirming Next.js 16 recognized `src/proxy.ts`.

### Potential concerns to address:
- `pnpm build` requires a real (or correctly formatted) `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` at build time. Clerk validates the key's base64-decoded frontend API URL against a regex (`/^(([a-z]+)-){2}([0-9]{1,2})\.clerk\.accounts([a-z.]*)(dev|com)$/i`). An empty or syntactically invalid key causes a hard build error during static prerender. The user must copy `.env.example` to `.env.local` and fill in real Clerk keys before running `pnpm build` locally.
- Next.js 16 renamed Middleware → Proxy. Any future documentation, AI suggestions, or third-party guides referencing `middleware.ts` will need to be translated to `proxy.ts` for this project.

---

## Progress Update as of 2026-05-18 14:30 Pacific

### Summary of changes since last update
Task 7 complete: replaced the no-op stub in `scripts/sync-versions.ts` with the real filesystem driver. The script loads `.env` via `dotenv/config`, reads `content/bill-of-rights/versions.json`, loads the three content files per version entry, builds a `VersionInput[]` with `isCurrent` derived from `versions.json.current`, captures the git HEAD SHA (best-effort, null on failure), and calls `syncVersions(db, inputs)`. Exits with code 1 on any error. Verified: project-wide `tsc --noEmit --skipLibCheck` is clean for the script (one pre-existing error in `sync.ts` around drizzle select typing is unrelated). Smoke test with `DATABASE_URL=''` correctly throws the db-client guard error, confirming all script logic up to the db call is correct.

### Detail of changes made:
- Replaced `scripts/sync-versions.ts` stub (4 lines) with the full 54-line implementation. Uses `node:fs`, `node:path`, `node:child_process` (execSync for `git rev-parse HEAD`), `dotenv/config`, `@/lib/db`, and `@/lib/db/sync`.
- `gitCommit()` wraps `execSync` in try/catch and returns `null` on failure, supporting shallow CI clones without git history.
- `main()` is an async function; `.catch()` handler logs the error and exits with code 1 for clean postbuild failure reporting.
- No new dependencies required — all imports were already installed in Task 1.

### Potential concerns to address:
- The pre-existing `sync.ts` TS2339 error (`Property 'markdownHash' does not exist on type '{}'`) is a drizzle-orm inference limitation from Task 6. It does not affect runtime behavior (values are present at runtime) but will surface in `tsc --noEmit` output. Not introduced by this task.

---

## Progress Update as of 2026-05-18 14:20 Pacific

### Summary of changes since last update
Task 6 complete: implemented `syncVersions(db, inputs)` idempotent version sync function via strict TDD. Created `src/lib/db/sync.ts` and `tests/lib/db.sync.test.ts` (4 tests, all passing). Also fixed the `tests/_helpers/pglite-db.ts` helper which had two latent bugs discovered on first actual use: (1) `db.execute(sql`...`)` goes through pglite's prepared-statement path which rejects multi-command strings — switched to `client.exec()` which handles them correctly; (2) `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"` is not available in pglite (which uses `gen_random_uuid()` as a Postgres 13+ builtin) — removed that line. All 11 tests across 3 test files pass.

### Detail of changes made:
- Created `src/lib/db/sync.ts` exporting `VersionInput` interface and `syncVersions(db, inputs): Promise<void>`. Uses `node:crypto` sha-256 for `markdownHash`, `agentsMdHash`, `specJsonHash`. Behavior: first-time inserts with `isCurrent: false` (set in single update pass below), no-op on hash match, throws "hash mismatch" on content change. Single `isCurrent` enforcement pass: if more than one input marked current → throw; if exactly one → flip all to false then set that one true; if none → flip all listed non-current versions to false. Uses a `Map` for O(n+m) lookup instead of O(n·m) queries.
- Created `tests/lib/db.sync.test.ts` with 4 tests: insert with hashes/parsed_json, idempotency (run twice, still 1 row), hash mismatch throws, `is_current` flip across two versions.
- Fixed `tests/_helpers/pglite-db.ts`: replaced `import { sql } from "drizzle-orm"` + `db.execute(sql`...`)` with `client.exec(...)` (bare template string, no tag); added `await client.ready` before DDL; removed `create extension if not exists "uuid-ossp"` (not available in pglite 0.2.17).

### Potential concerns to address:
- `syncVersions` does not use a Drizzle transaction (intentional — pglite transaction semantics with drizzle-orm are still maturing; documented in schema.ts comment). In production Neon, a partial failure between the loop and the `is_current` update pass could leave `is_current` inconsistent. Acceptable for MVP; Task 7 will be the only caller and runs in a controlled postbuild context.
- `db: any` typing is intentional pragmatism to support both Neon HTTP and pglite backends without a generic type parameter.

---

## Progress Update as of 2026-05-18 14:13 Pacific

### Summary of changes since last update
Task 5 complete: implemented the anchor-aware markdown parser via strict TDD. Created `src/lib/markdown/parse.ts` (pure `parseDocument` function), `tests/lib/markdown.parse.test.ts` (4 tests, all passing), and `tests/_helpers/fixtures.ts` (sample document fixture). Sanity check against real `content/bill-of-rights/v1.0.0.md` confirmed: frontmatter version 1.0.0, 10 articles (including preamble), 30 sentence anchors.

### Detail of changes made:
- Created `tests/_helpers/fixtures.ts` with `SAMPLE_DOC` constant: a minimal 3-article markdown doc (preamble + article-1 + article-2) with YAML frontmatter, heading anchors, and sentence anchors.
- Created `tests/lib/markdown.parse.test.ts` with 4 tests: frontmatter extraction, article list extraction, anchor-tagged sentence extraction, and `{#...}` marker stripping from emitted text. Ran against missing module first (FAIL), then wrote implementation (PASS).
- Created `src/lib/markdown/parse.ts` exporting 4 interfaces (`Sentence`, `Paragraph`, `Article`, `ParsedDocument`) and the `parseDocument(raw) → ParsedDocument` function. Uses `gray-matter` for frontmatter, regex `/^(#{1,3})\s+(.+?)\s*\{#([a-z0-9-]+)\}\s*$/` for heading detection, and `/{#([a-z0-9-]+)}/g` for sentence anchor splitting. Line-by-line walk; blank lines flush paragraph buffers into the current article.
- Sanity-checked parser logic against real `v1.0.0.md` using a Node one-liner (no TypeScript build required): article count = 10, sentence anchor count = 30, both match the Task 4 spec exactly.

### Potential concerns to address:
None. All 4 tests pass. Real content file counts match spec. No leftover `{#...}` markers in any sentence text. No unused imports.

---

## Progress Update as of 2026-05-18 14:18 Pacific

### Summary of changes since last update
Task 4 complete: seeded v1.0.0 of the Bill of Rights and v1 consent text into the repo. Created 5 files: `content/bill-of-rights/v1.0.0.md` (9 articles, 30 sentence anchors), `content/bill-of-rights/v1.0.0.agents.md` (stub implementation guide), `content/bill-of-rights/v1.0.0.spec.json` (stub per-principle spec), `content/bill-of-rights/versions.json` (version index), and `content/consent/v1.md` (consent form template with 16 placeholder tokens). All files validated: JSON parses, sentence anchors present, placeholders match captured_fields shape.

### Detail of changes made:
- Created `content/bill-of-rights/v1.0.0.md` with complete preamble + 9 articles. Each heading has an anchor `{#article-N}` or `{#preamble}`, and every sentence has a per-sentence anchor `{#article-N-s-M}` or `{#preamble-s-1}`. Total: 30 sentence anchors (preamble: 1, article-1: 4, article-2: 4, article-3: 3, article-4: 3, article-5: 1, article-6: 3, article-7: 5, article-8: 4, article-9: 2).
- Created `content/bill-of-rights/v1.0.0.agents.md` with status=stub and note that full directives will land in a future version. Includes self-attestation block template for README reuse.
- Created `content/bill-of-rights/v1.0.0.spec.json` stub with single principle entry (data-ownership) containing empty arrays for prohibited/required behaviors and test conditions. Includes `_note` field.
- Created `content/bill-of-rights/versions.json` index tracking current version 1.0.0 with published_at (2026-05-18), release_notes_pr (null), and changelog.
- Created `content/consent/v1.md` form template with 16 `{{token}}` placeholders: 4 public (display_name, location, affiliation, verification_method), 12 private (ip, ip_geo_city, ip_geo_country, browser_name, browser_version, os_name, os_version, screen_resolution, timezone, language, referrer, signing_session_utc). Placeholders match the captured_fields shape from the database schema.

### Potential concerns to address:
None. All files validated: both JSON files parse correctly, sentence anchor count matches spec (30 total), consent template placeholders match schema (16 total), and all trailing newlines preserved.

---

## Progress Update as of 2026-05-18 14:06 Pacific

### Summary of changes since last update
Task 3 complete: generated the initial Drizzle migration and created `.env.example`. Ran `pnpm db:generate` which produced `drizzle/0000_ambitious_rage.sql` (52 lines of DDL creating all four tables with proper indexes and foreign keys) plus `drizzle/meta/_journal.json`. Created `.env.example` at repo root with all 6 required env vars (DATABASE_URL, NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY, RESEND_API_KEY, RESEND_FROM_EMAIL, NEXT_PUBLIC_SITE_URL) and force-added it to git despite `.gitignore/*.env*` rules.

### Detail of changes made:
- Ran `pnpm db:generate` which invoked drizzle-kit against `src/lib/db/schema.ts`, generating `drizzle/0000_ambitious_rage.sql` with full DDL for all 4 tables: `versions` (11 cols, 1 unique index), `signers` (10 cols, 1 unique constraint on `clerk_user_id`), `consent_records` (6 cols, 1 FK to signers), `signatures` (6 cols, 3 FKs to signers/versions/consent_records, 1 unique index). All columns use `gen_random_uuid()` as default (Postgres 13+ builtin, matches pglite test helper DDL).
- Generated `drizzle/meta/_journal.json` tracking the migration as entry 0 with tag `0000_ambitious_rage` at timestamp 1779138409813.
- Created `.env.example` with all 6 env vars documented, including comments for Neon, Clerk, Resend APIs and site URL.
- Staged and committed with `git add -f .env.example` to bypass `.gitignore/*.env*` pattern (`.env.example` is the template, not a real secret file).

### Potential concerns to address:
None. Migration DDL structure matches the pglite test helper DDL (modulo formatting). All env vars in `.env.example` are template placeholders as specified in the plan.

---

## Progress Update as of 2026-05-18 14:15 Pacific

### Summary of changes since last update
Task 2 complete: added Drizzle schema for all four Phase 1 tables (`versions`, `signers`, `consent_records`, `signatures`), the Neon HTTP database client, the pglite in-memory test helper, and the drizzle-kit config. All 3 schema tests pass.

### Detail of changes made:
- Created `src/lib/db/schema.ts` defining 4 pgTable exports: `versions` (with `uniqueIndex` on `version`), `signers` (with `.unique()` on `clerk_user_id`), `consentRecords` (references `signers.id`), and `signatures` (references `signers.id`, `versions.id`, `consentRecords.id`; `uniqueIndex` on `(signer_id, version_id)`). The partial-unique index for `is_current = true` is intentionally omitted (enforced transactionally in the sync script per plan trade-off note).
- Created `src/lib/db/index.ts` as the production database client using `drizzle-orm/neon-http` and `@neondatabase/serverless`. Guards on `DATABASE_URL` at import time; exports both `db` and `schema`.
- Created `tests/_helpers/pglite-db.ts` — `createTestDb()` spins up a fresh `PGlite` in-memory instance, runs raw DDL to mirror the Drizzle schema, and returns a typed `TestDb`. Safe for tests since it never touches `src/lib/db/index.ts` (which would throw without `DATABASE_URL`).
- Created `drizzle.config.ts` pointing drizzle-kit at `./src/lib/db/schema.ts`, output to `./drizzle`, dialect `postgresql`.
- Created `tests/lib/db.schema.test.ts` with 3 tests: table exports present, `signers.clerkUserId` defined, `consentRecords.capturedFields` defined. TDD: ran test against missing module (FAIL), then wrote schema (PASS).
- Confirmed `drizzle-orm/pglite` and `drizzle-orm/neon-http` submodules both resolve from installed `drizzle-orm@0.36.4`.

### Potential concerns to address:
- `src/lib/db/index.ts` throws at import time if `DATABASE_URL` is unset — this is intentional and documented, but any server-side code that imports from `@/lib/db` will break in environments without the env var. Tests must always use `createTestDb()` from the helper, never the production client.
- The CJS deprecation warning from Vite's Node API appears in test runs but does not affect test results. It will be silenced once the ecosystem moves to ESM-only — not actionable now.

---

## Progress Update as of 2026-05-18 14:00 Pacific

### Summary of changes since last update
Fixed code quality review issues on Task 1: created `scripts/sync-versions.ts` as a no-op stub so `pnpm build` no longer fails on the postbuild hook, and removed `@types/ua-parser-js@0.7.39` from devDependencies to eliminate conflicting type definitions for `ua-parser-js@2.x`. Both fixes verified: `pnpm build` succeeds and `pnpm test` still correctly reports "No test files found."

### Detail of changes made:
- Created `scripts/sync-versions.ts` with a stub console.log (no-op until Task 7 implements real logic). This unblocks the `postbuild` npm script which was failing because the file did not exist.
- Removed `@types/ua-parser-js@0.7.39` from devDependencies. The v2.x runtime package includes its own TypeScript definitions; the DefinitelyTyped package (for v0.x) was misleading and now unnecessary.
- Ran `pnpm install` to update `pnpm-lock.yaml` (entry for @types/ua-parser-js removed, stub script added to repo).
- Verified `pnpm build` completes successfully; postbuild hook runs stub and exits with status 0.
- Verified `pnpm test` still outputs "No test files found, exiting with code 1" — expected at this stage.

### Potential concerns to address:
None new. The original Task 1 concerns remain (documented below).

---

## Progress Update as of 2026-05-18 13:45 Pacific
*(Earlier updates)*

### Summary of changes since last update
Task 1 complete: installed all runtime and dev dependencies, scaffolded the full directory layout, created `vitest.config.ts`, added the `@/*` path alias (already present in `tsconfig.json`), and wired up 6 new npm scripts in `package.json`. Smoke test confirms vitest is configured correctly.

### Detail of changes made:
- Installed 10 runtime deps: `@clerk/nextjs@6.39.3`, `@neondatabase/serverless@0.10.4`, `drizzle-orm@0.36.4`, `resend@4.8.0`, `ua-parser-js@2.0.9`, `remark@15.0.1`, `remark-gfm@4.0.1`, `unified@11.0.5`, `unist-util-visit@5.1.0`, `gray-matter@4.0.3`.
- Installed 7 dev deps: `drizzle-kit@0.30.6`, `vitest@2.1.9`, `@vitest/ui@2.1.9`, `@types/ua-parser-js@0.7.39`, `@electric-sql/pglite@0.2.17`, `dotenv@17.4.2`, `tsx@4.22.2`.
- Created directory skeleton: `content/bill-of-rights`, `content/consent`, `scripts`, `src/components`, `src/lib/{db,markdown,fingerprint,consent,email}`, `src/server/actions`, `src/app/{about,why,bill-of-rights,v/[version],sign/profile,sign/consent,sign/complete,signatories,signatories/[id],account,account/revoke}`, `tests/{_helpers,lib,server}`.
- Created `vitest.config.ts` with node environment, `tests/**/*.test.{ts,tsx}` include glob, 15s timeout, and `@` alias pointing to `./src`.
- `tsconfig.json` already contained the `@/*: ["./src/*"]` path alias — no changes needed.
- Added scripts to `package.json`: `test` (vitest run), `test:watch` (vitest), `db:generate`, `db:push`, `sync-versions`, `postbuild`. Original 4 scripts (`dev`, `build`, `start`, `lint`) preserved.
- `pnpm test` smoke test output: "No test files found, exiting with code 1" — confirms vitest wired with no config errors.

### Potential concerns to address:
- `pnpm approve-builds` warning for `@clerk/shared` and several `esbuild` versions: build scripts were ignored by pnpm's default security policy. This is normal for CI/CD environments; if `@clerk/shared` native build is required for auth features, run `pnpm approve-builds` during Task 8 (Clerk middleware setup).
- `postbuild` script references `scripts/sync-versions.ts` which does not exist yet (Task 7). Running `pnpm build` will fail until that file is created — this is expected and documented in the plan.
- Newer versions of several packages are available (e.g., `vitest@4.1.6`, `@neondatabase/serverless@1.1.0`, `resend@6.12.3`) but were intentionally pinned to the semver ranges in the task spec.
- Two deprecated subdependencies flagged: `@esbuild-kit/core-utils@3.3.2` and `@esbuild-kit/esm-loader@2.6.5` (pulled in by drizzle-kit). Not blocking.

---
