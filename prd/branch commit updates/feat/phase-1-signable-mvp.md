# Branch Progress: feat/phase-1-signable-mvp

## Progress Update as of 2026-05-18 14:06 Pacific
*(Most recent updates at top)*

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
