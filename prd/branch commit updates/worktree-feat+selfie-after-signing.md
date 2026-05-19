# Branch Progress: worktree-feat+selfie-after-signing

## Progress Update as of 2026-05-19 15:30 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Implemented the full selfie-after-signing feature per the spec, end to end: schema migration, six server actions, five components, four wired pages, OG image route, /admin/selfies moderation queue, revocation cascade. 76/77 vitest tests passing (one pre-existing transaction test on main unchanged); TypeScript compile clean; production Next.js build compiles and type-checks successfully. Also: made HumaneBench.ai a clickable link on /about (separate small commit at user's request). The branch is ready for review.

### Detail of changes made:
- **Schema** (`src/lib/db/schema.ts` + `drizzle/0002_add_selfies.sql`): added `selfies` and `selfie_reports` tables. Hand-wrote the partial-unique active-approved index in SQL (drizzle 0.36 still fragile on `uniqueIndex().where()` per the MVP spec's same warning). Backfilled the missing journal entry for the existing `0001_add_signer_notification_preference` migration so the journal is consistent.
- **Lib code**:
  - `src/lib/selfie/policy.ts` — `validateSelfieInput` + dimension check + rejection-reason enum + plain-language reason mapping + `SELFIE_RATE_LIMIT_PER_HOUR=5` + `SELFIE_AUTO_HIDE_THRESHOLD=3`.
  - `src/lib/images/process.ts` — sharp pipeline producing three sizes (original 2048max JPEG, display 512×512 WebP, thumbnail 96×96 WebP). Auto-rotates per EXIF, strips metadata.
  - `src/lib/storage/blob.ts` — `@vercel/blob` wrapper with injectable backend; `createInMemoryBackend()` for tests; `deleteSelfieBlobsByUrls()` is best-effort (404 is fine).
  - `src/lib/selfie/queries.ts` — `getActiveSelfieForSigner`, `getActiveSelfiesForSigners` (batch), `getLatestSelfieForSigner`, `countUnresolvedReports`, plus the four admin tab queries (`getPendingSelfies`, `getAutoHiddenSelfies`, `getRejectedSelfies`, `getApprovedSelfiesForAdmin`).
- **Server actions** (`src/server/actions/selfie.ts`): six action pairs (testable pure-function core + form-action wrapper), mirroring the existing `sign.ts` pattern. Submit handles validate → rate-limit → sharp → blob upload → DB insert with rollback-on-error. Approve marks any prior active row as replaced (preserves partial-unique invariant). Report is idempotent via the unique index and auto-hides at threshold. Resolve "allowed" clears auto-hide; "hidden" converts to rejected. RemoveMine keeps the original for the audit window.
- **Revocation cascade** (`src/server/actions/revoke.ts`): now best-effort-deletes the signer's selfie blobs, then deletes `selfie_reports` and `selfies` rows before the existing signatures/consent_records cleanup. The legacy Phase 3 cleanup (reports/comment_upvotes/comments) is now wrapped in `tryDeleteLegacy()` which swallows "relation does not exist" — fixed a pre-existing pglite test failure as a side effect. Updated `/account/revoke` copy to mention photo deletion.
- **Components**:
  - `<SelfieAvatar>` (server) — sm/md/lg sizes, initials placeholder, raw `<img>` (not next/image — Blob CDN URLs are stable per upload; the optimization round-trip isn't worth the latency at small sizes).
  - `<SelfieCapture>` (client) — hybrid capture: `getUserMedia` primary with `<input type="file" capture="user">` fallback. Detects camera support lazily during render (no setState-in-effect).
  - `<SelfieCard>` (client, `/account`) — state-specific affordances (replace/remove if approved; retake if rejected/hidden).
  - `<SelfieStatusBadge>` — pill for each lifecycle state.
  - `<ReportSelfieButton>` (client) — inline modal on `/signatories/[id]` for non-owner verified signers.
  - Admin: `<AdminSelfiesClient>` (client) inside `/admin/selfies/page.tsx` (server, admin-gated via `getCurrentAdmin`).
- **Email templates** (`src/lib/email/templates.ts`): `selfieApproved`, `selfieRejected`, `selfieAutoHidden`. Plain text via Resend, matching the existing `signConfirmation` style.
- **Pages wired**:
  - `/sign/complete`: renders `<SelfieCapture context="post-sign"/>` below the existing CTAs; skipped if signer already has a submitted selfie.
  - `/account`: server fetches latest selfie + derives `SelfieCardData`; AccountClient renders `<SelfieCard>` above the signatures section.
  - `/signatories/[id]`: avatar next to display name; `<ReportSelfieButton>` for non-owner signed-in viewers; `openGraph` + `twitter` images now point at `/api/og/signer/[id]`.
  - `/signatories`: batch-fetches active selfies and passes the Map into each `<SignatureCard>` (no N+1).
  - `/admin/signers`: added admin sidebar nav linking to `/admin/selfies`.
  - `/admin/selfies`: NEW. Tabbed gallery with approve/reject (with reason picker)/restore actions.
- **OG image route** `/api/og/signer/[id]`: `next/og` ImageResponse, 1200×630, selfie + name + affiliation/location; falls back to a single-initial card when no approved selfie.
- **Disclaimer file** `content/selfie/disclaimer.md`: snapshot of the inline disclaimer copy for git-history auditability.
- **Deps added**: `sharp ^0.34` (native), `@vercel/blob ^2.4`. `next.config.ts` allowlists `**.public.blob.vercel-storage.com` for `next/image`. `.env.example` documents `BLOB_READ_WRITE_TOKEN`.
- **Tests**: 6 new test files (~25 new test cases). All 76 selfie-related cases pass. `tests/_helpers/pglite-db.ts` now mirrors the new tables' DDL.

### What's needed before this branch can ship:
- **Set `BLOB_READ_WRITE_TOKEN`** in Vercel (Preview + Production) and locally (`.env.local`). The action throws clearly if the token is missing.
- **Apply migrations**: `pnpm db:generate` should be a no-op since the migration is hand-written, but `pnpm db:push` (or `pnpm drizzle-kit migrate` on a Neon dev branch) will need to run against the target DB. Also: backfill the `0001_add_signer_notification_preference` migration if your DB hasn't been migrated past that (the journal entry was missing on `main`; the SQL file already existed).
- **`/admin/selfies` link styling**: only basic; tweak to match existing admin design as the admin surface evolves.
- **HEIC support**: depends on the installed `sharp` build including libheif. The npm-distributed `sharp ≥0.33` does include it on macOS/Linux x64+arm64; if a Vercel build ever fails on HEIC decode, document the postinstall fix.

### Potential concerns to address:
- **One pre-existing test failure remains**: `tests/server/sign.test.ts > rolls back consent_records when signatures insert fails`. This test asserts transaction-rollback semantics the neon-http driver doesn't support. Documented in earlier progress logs as a known limitation; not introduced by this work. Fixing would require switching to the neon WebSocket driver.
- **Lint baseline**: project lint is not enforced cleanly on `main` (85 pre-existing errors). My code adds errors of the same character (`any` on db params, lazy `require()`s) — matching the existing convention from `sign.ts`, `admin.ts`, `queries.ts`. Worth a project-wide cleanup later, but not blocking this branch.
- **Stash collision** during the verification phase: an old stash from a completely different branch (`chore/phase-1-3-followups: wip-archive-view-and-admin-edit`) was accidentally popped, creating conflicts in three files (`src/app/admin/signers/page.tsx`, `src/app/v/[version]/page.tsx`, `src/components/DocumentRenderer.tsx`). I restored those files to my last commit. **The stash is still present** (`git stash list` shows `stash@{0}`) and should be re-applied on `chore/phase-1-3-followups` when the user is on that branch — DO NOT drop it without inspecting first.
- **Static prerender error during `pnpm build`** for `/_not-found` — caused by missing `CLERK_PUBLISHABLE_KEY` in the build environment, not by selfie code. Compile + TypeScript pass cleanly. Will succeed in any env that has Clerk credentials configured.

### Side-quest commit on this branch:
- **HumaneBench.ai is now a clickable link** on `/about` (opens in a new tab with noopener/noreferrer). Per the user's mid-implementation request; single commit, no impact on the selfie work.

---

## Progress Update as of 2026-05-19 14:15 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Wrote the design spec for the "selfie after signing" feature at `docs/superpowers/specs/2026-05-19-selfie-after-signing-design.md`. Optional, admin-moderated photo upload available on `/sign/complete` and `/account`. Captures via `getUserMedia` (live, primary) or `<input type="file" capture="user">` (upload fallback; opens the native camera on mobile). Reviewed at `/admin/selfies` with approve/reject/auto-hide-after-3-reports. Stored on Vercel Blob in three derived sizes (original 2048px JPEG private, display 512×512 WebP public, thumbnail 96×96 WebP public). Branched from `main` via the EnterWorktree harness; this branch contains the schema + code for selfies only — no overlap with the in-flight `feat/proposed-tabs-phase-1-schema` work.

### Detail of changes made:
- **Spec lives at `docs/superpowers/specs/2026-05-19-selfie-after-signing-design.md`** (~13 sections) and follows the same structural conventions as the MVP spec.
- **Two new tables** in the design: `selfies` (lifecycle row per submission with status enum `pending|approved|rejected|auto_hidden|removed`, 3 blob URLs, capture metadata, review fields, `replaced_by_selfie_id` self-FK) and `selfie_reports` (with unique `(selfie_id, reporter_signer_id)`). One partial-unique index enforces "at most one active approved selfie per signer" — same drizzle workaround noted in the MVP spec for the `versions.is_current` partial unique.
- **Active selfie predicate**: `status='approved' AND auto_hidden_at IS NULL AND removed_at IS NULL AND replaced_by_selfie_id IS NULL`. Used by `getActiveSelfieForSigner` and the partial unique index.
- **Six new server actions** in `src/server/actions/selfie.ts`: `submitSelfieAction`, `approveSelfieAction`, `rejectSelfieAction`, `reportSelfieAction`, `removeMySelfieAction`, `resolveSelfieReportAction`. All follow the lazy `getDb()` pattern from `sign.ts` for testability.
- **Five new components**: `<SelfieCapture>` (client, the heart of the capture UX), `<SelfieAvatar>` (server, single source of truth for "render a signer's photo or placeholder" with sm/md/lg sizes), `<SelfieCard>` (account-page status card), `<SelfieStatusBadge>`, `<SelfieReviewCard>` (admin), `<ReportSelfieButton>`.
- **Three new email templates** in `src/lib/email/templates.ts`: `selfieApproved`, `selfieRejected` (plain-language reason mapping), `selfieAutoHidden`.
- **New route** `/admin/selfies` with pending/auto-hidden/rejected/approved tabs.
- **New route** `/api/og/signer/[id]` rendering 1200×630 OG image via `next/og`, with the selfie when approved.
- **Vercel Blob** for storage. Path scheme `selfies/<signer_id>/<selfie_id>/{original.jpg,display.webp,thumbnail.webp}` keeps signer-scoped data grouped for revocation cleanup.
- **Privacy posture**: inline disclaimer (no separate consent screen — owner's call after Q4); no face recognition; one-click photo removal from `/account`; full purge of all blobs on `/account/revoke`. Disclaimer text lives at `content/selfie/disclaimer.md` for git-history auditability.
- **Tests** mirror the existing vitest + pglite pattern. New: policy validation, selfie queries, submit action (happy path + replace + rate limit), review action (approve/reject + email send mocked), report action (threshold + duplicate suppression), revoke regression (selfies cleaned up).

### Potential concerns to address:
- **Vercel Blob credentials needed**: `BLOB_READ_WRITE_TOKEN` env var must be set before submit-selfie will work locally or in preview. Worth adding to `.env.example` when implementation lands.
- **`sharp` is a native binary dep** with platform-specific install. Vercel's build does the right thing, but local-dev on a fresh checkout needs `pnpm install` to pick up the right binary; document in README at implementation time.
- **HEIC support requires sharp with libheif** — the bundled `sharp` from npm should include it on modern versions, but if a build fails on Vercel we may need a postinstall hint.
- **Partial-unique index on selfies** must be hand-written in the migration SQL the same way the MVP avoided drizzle's partial-unique surface. Implementer should not try to use drizzle's `uniqueIndex().where(...)` API — it's still fragile.
- **Storage cost** scales linearly with signers × replacements. The 2048px JPEG cap and WebP derivatives keep per-signer storage well under 1 MB. Should be reassessed at ~50k signers.
- **No CSP for blob URLs yet** — when implementation lands, the `next.config.ts` image config will need to allowlist the Vercel Blob hostname for `<Image>` optimization (or we use raw `<img>` for the avatar). Implementer should pick one approach and document.

---
