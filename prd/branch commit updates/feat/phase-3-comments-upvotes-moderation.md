# Branch Progress: feat/phase-3-comments-upvotes-moderation

## Progress Update as of 2026-05-18 (Plan 3 Task 3: DB-backed rate-limit enforcer)
*(Most recent updates at top)*

### Summary of changes since last update
Created `src/lib/ratelimit/enforce.ts` with the `enforceRateLimit` function and `RateLimitError` class. Added `tests/lib/ratelimit.enforce.test.ts` with 2 TDD tests (allow below limit, throw at/above limit). All 41 tests pass; TypeScript clean.

### Detail of changes made:
- `src/lib/ratelimit/enforce.ts`: pure utility that counts rows in a sliding window using Drizzle `and(eq, gte)` with a `count(*)::int` aggregate. Throws `RateLimitError` when `count >= limit`, returns `{ allowed: true }` otherwise. Accepts a generic `RateLimitOptions` interface so it works for comments, upvotes, or any future table.
- `tests/lib/ratelimit.enforce.test.ts`: seeds a fresh PGlite DB per test, verifies the happy path (no comments → allowed) and the blocking path (5 comments inserted → throws `RateLimitError`).

### Potential concerns to address:
- None introduced by this task. Existing concerns from prior entries still apply (soft-ban not enforced at submit time; N+1 listCommentsForAnchor; full-payload drawer; unused AnchorMarker.tsx).

---

## Progress Update as of 2026-05-18 (Plan 3 Task 2: migration generated and applied)
*(Most recent updates at top)*

### Summary of changes since last update
Generated Drizzle migration file (`drizzle/0002_useful_excalibur.sql`) via `pnpm db:generate` and successfully applied it to Neon via `pnpm db:push`. Migration is additive only: creates three new tables (`comments`, `comment_upvotes`, `reports`) with all foreign key constraints and the unique index for upvotes.

### Detail of changes made:
- Migration file: `drizzle/0002_useful_excalibur.sql` (37 lines total)
- Creates three tables with CREATE TABLE statements (lines 1-28)
- Adds six foreign key constraints via ALTER TABLE (lines 30-36)
- Creates unique index `comment_upvotes_pk` on `(comment_id, signer_id)` (line 37)
- All three tables properly reference existing tables (`versions`, `signers`, `comments`)
- No destructive operations (no DROP/ALTER to existing tables)
- Migration applied successfully to Neon (exit 0)

### Potential concerns to address:
- None. Task 2 complete and ready for Task 3 (server action implementations).

---

## Progress Update as of 2026-05-18 (Plan 3 Task 1: schema tables)
*(Most recent updates at top)*

### Summary of changes since last update
Added `comments`, `comment_upvotes`, and `reports` tables to the Drizzle schema (`src/lib/db/schema.ts`), mirrored the DDL in the PGlite test helper (`tests/_helpers/pglite-db.ts`), and added three assertions to the schema test (`tests/lib/db.schema.test.ts`). Full test suite passes (39 tests).

### Detail of changes made:
- `comments`: uuid PK, FK to `versions` and `signers`, `anchor_id` text, `body` text, nullable `parent_comment_id` for threading, `hidden_at`/`hidden_reason` for soft-hide.
- `comment_upvotes`: composite PK `(comment_id, signer_id)` enforced via `uniqueIndex("comment_upvotes_pk")`; FK to `comments` and `signers`.
- `reports`: uuid PK, FK to `comments` and `signers` (reporter + optional resolver), `resolution` enum `('hidden' | 'allowed')`, `resolved_at`/`resolved_by` for audit trail.
- PGlite DDL includes partial indexes: `comments_version_anchor_active` (active comments per anchor), `comments_parent`, `comment_upvotes_comment`, `reports_pending` (unresolved reports per comment).

### Potential concerns to address:
- None introduced by this task. Pre-existing concerns from prior entry still apply.

---

## Progress Update as of 2026-05-18 17:00 Pacific (Plan 3 spec written)
*(Most recent updates at top)*

### Summary of changes since last update
First entry. Branched off `feat/phase-2-as-code-attestations` at SHA `a13b41b`. Wrote Phase 3 implementation plan at `docs/superpowers/plans/2026-05-18-phase-3-comments-upvotes-moderation.md`. 13 TDD tasks: three new tables (`comments`, `comment_upvotes`, `reports`) with indexes, DB-backed rate-limit enforcement, four server-action surfaces (comment CRUD, upvote toggle, report with auto-soft-hide at 5 reports, admin resolve), four new components (recursive `CommentThread`, client `CommentComposer`/`UpvoteButton`/`ReportModal`), the client-side hover-to-comment drawer wired into `/v/[version]`, and three admin pages (`/admin/reports`, `/admin/signers`, `/admin/comments`).

### Detail of changes made:
- Plan covers Section 8 of the design spec + the admin routes from Section 4.2.
- Comments scoped to `(version_id, anchor_id)`; arbitrary nesting via `parent_comment_id`; visual depth-collapse at 4 (desktop) handled by `<details>` accordion past depth-4. Mobile cap at 2 deferred to a CSS polish pass.
- Rate limiting is a single pure function `enforceRateLimit(db, opts)` that counts rows in a sliding window — simpler than Redis, good enough for MVP, easy to swap later. 5 comments/min and 50/day for comments are applied at submit time.
- Reports trigger an auto-soft-hide at 5 unresolved reports per comment (configurable constant). Moderator manual hide flips `hidden_at` directly.
- The drawer is one client component (`CommentDrawer`) listening to a `window.dispatchEvent("anchor-open", { anchorId })` custom event emitted by each `<AnchorSentence>` wrapper. Keeps the document body server-rendered while still feeling interactive.
- Admin pages reuse the `signers.is_admin` gate established in Plan 2's `/admin/attestations`. Each admin server action re-checks `is_admin` server-side (defense-in-depth — middleware ensures auth, action ensures role).
- Branches off Phase 2; will need rebase onto main once Phases 1+2 are merged.

### Potential concerns to address:
- `softBannedAt` column is set by `/admin/signers` but **not enforced** in `submitCommentAction`/`submitUpvoteAction`/`submitReportAction`. Soft-banned signers can still post. Tracked as known follow-up; trivial fix (add `isNull(signers.softBannedAt)` to the signer lookup) but worth being explicit about pre-launch.
- `listCommentsForAnchor` is called once per anchor in the version page handler (N+1 in number of anchors-with-comments). Acceptable until pages with hundreds of discussed sentences appear; replace with a single `WHERE anchor_id IN (...)` query then.
- The drawer ships ALL comments for the version in the initial client payload. At thousands of comments this becomes bloat; defer to incremental fetch in a follow-up.
- Plan creates an unused `AnchorMarker.tsx` (referenced in file structure + as Step 1 of Task 9) that's superseded by `AnchorSentence.tsx`. Implementers should skip the `AnchorMarker.tsx` creation step or delete the file after creating it. (Spec bug; non-blocking.)

---
