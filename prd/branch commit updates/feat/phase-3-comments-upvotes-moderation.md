# Branch Progress: feat/phase-3-comments-upvotes-moderation

## Progress Update as of 2026-05-18 (Plan 3 Task 8: comment components)
*(Most recent updates at top)*

### Summary of changes since last update
Created four UI components: `CommentThread` (server), `CommentComposer` (client), `UpvoteButton` (client), `ReportModal` (client). TypeScript clean; 52 tests pass (no new tests in this task).

### Detail of changes made:
- `src/components/CommentThread.tsx`: Recursive server component that filters `comments` by `parentCommentId` at each depth level. Renders `VerificationBadge`, `UpvoteButton`, `ReportModal`, and `CommentComposer` per comment. Hidden comments show `[comment hidden by moderator]` placeholder. Replies past `maxDepth` (default 4) are collapsed inside a `<details>` accordion.
- `src/components/CommentComposer.tsx`: Client form wired to `submitCommentAction`. Accepts optional `parentCommentId` for replies; passes `versionId`, `versionString`, `anchorId` as hidden inputs.
- `src/components/UpvoteButton.tsx`: Client form wired to `submitUpvoteAction`. Renders a pill button showing the current `count`.
- `src/components/ReportModal.tsx`: Client component using `useRef<HTMLDialogElement>` to open/close a native `<dialog>`. Form submits to `submitReportAction` with optional free-text reason.

### Potential concerns to address:
- All prior concerns from Tasks 1–7 still apply.

---

## Progress Update as of 2026-05-18 (Plan 3 Task 7: comment query helpers)
*(Most recent updates at top)*

### Summary of changes since last update
Added `listCommentsForAnchor`, `countCommentsByAnchor`, and `listPendingReports` to `src/lib/db/queries.ts`. Added `CommentTreeItem` interface. Added `tests/lib/db.queries.comments.test.ts` with 3 TDD tests. All 52 tests pass; TypeScript clean.

### Detail of changes made:
- `src/lib/db/queries.ts`: Updated top-level imports to include `sql` from `drizzle-orm` and `comments`, `commentUpvotes`, `reports` from schema. `listCommentsForAnchor` does an `innerJoin` on `signers` and a correlated subquery for `upvoteCount` via `sql<number>`. `countCommentsByAnchor` groups by `anchor_id` filtering out hidden comments (`isNull(hiddenAt)`). `listPendingReports` joins `reports → comments → versions → signers` filtering by `isNull(resolvedAt)`.
- `tests/lib/db.queries.comments.test.ts`: 3 tests covering each exported query helper.

### Potential concerns to address:
- `listCommentsForAnchor` uses a correlated subquery for `upvoteCount`; fine for MVP but consider a LEFT JOIN with GROUP BY at scale.
- All prior concerns from Tasks 1–6 still apply.

---

## Progress Update as of 2026-05-18 (Plan 3 Task 6: report action with auto-soft-hide)
*(Most recent updates at top)*

### Summary of changes since last update
Created `src/server/actions/reports.ts` with `reportComment`, `resolveReport`, and `submitReportAction`. Added `tests/server/reports.test.ts` with 2 TDD tests (creates report row, auto-hides at 5-report threshold). All 49 tests pass; TypeScript clean.

### Detail of changes made:
- `src/server/actions/reports.ts`: `reportComment` inserts a report row, then counts unresolved reports for the comment; if count >= 5 and the comment isn't already hidden, sets `hiddenAt` + `hiddenReason = "auto: threshold of reports"`. `resolveReport` marks a report resolved with a resolution value. `submitReportAction` is the Next.js Server Action wired to Clerk auth and signer lookup, delegates to `reportComment`, then `revalidatePath`.
- `tests/server/reports.test.ts`: 2 tests covering single-report insertion and auto-hide trigger at exactly 5 reports.

### Potential concerns to address:
- No deduplication guard (same signer can file multiple reports on the same comment). Could add a unique index on `(comment_id, reporter_signer_id)` if needed.
- `submitReportAction` does not check `softBannedAt` (same pre-existing concern as comments/upvotes).
- All prior concerns from Tasks 1–5 still apply.

---

## Progress Update as of 2026-05-18 (Plan 3 Task 5: upvote toggle action)
*(Most recent updates at top)*

### Summary of changes since last update
Created `src/server/actions/upvotes.ts` with `toggleUpvote` and `submitUpvoteAction`. Added `tests/server/upvotes.test.ts` with 2 TDD tests (first call adds, second removes). All 47 tests pass; TypeScript clean.

### Detail of changes made:
- `src/server/actions/upvotes.ts`: `toggleUpvote` helper accepts optional `dbClient` (for testing), looks up existing upvote via `and(eq(commentId), eq(signerId))`, deletes if found (returns `{ upvoted: false }`), or inserts new row (returns `{ upvoted: true }`). `submitUpvoteAction` is the Server Action wired to Clerk auth, signer lookup, delegates to `toggleUpvote`, then `revalidatePath`.
- `tests/server/upvotes.test.ts`: 2 tests covering toggle logic (add on first, remove on second).

### Potential concerns to address:
- `submitUpvoteAction` does not check `softBannedAt` (same pre-existing concern as comments). Trivial one-liner fix.
- All prior concerns from Tasks 1–4 still apply.

---

## Progress Update as of 2026-05-18 (Plan 3 Task 4: comment server actions)
*(Most recent updates at top)*

### Summary of changes since last update
Created `src/server/actions/comments.ts` with `createComment`, `hideComment`, `unhideComment`, and `submitCommentAction`. Added `tests/server/comments.test.ts` with 4 TDD tests (top-level insert, reply insert, empty-body rejection, hide/unhide cycle). All 45 tests pass; TypeScript clean.

### Detail of changes made:
- `src/server/actions/comments.ts`: lazy `getDb()` pattern; `createComment` validates trimmed body (empty → throws, >5000 chars → throws), inserts into `comments`, returns `{ id }`; `hideComment` sets `hidden_at` + `hidden_reason`; `unhideComment` clears both to null; `submitCommentAction` is the Next.js Server Action wired to Clerk auth, signer lookup, dual rate-limit enforcement (5/min, 50/day via `enforceRateLimit`), then delegates to `createComment`, then `revalidatePath`.
- `tests/server/comments.test.ts`: 4 tests covering the three exported helpers (submitCommentAction not unit-tested since it requires Clerk + Next.js context).

### Potential concerns to address:
- `softBannedAt` still not checked in `submitCommentAction` (pre-existing tracked concern). Trivial one-liner fix before launch.
- All prior concerns from Task 3 and earlier still apply.

---

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
