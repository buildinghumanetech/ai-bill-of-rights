# Branch Progress: worktree-feat+selfie-after-signing

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
