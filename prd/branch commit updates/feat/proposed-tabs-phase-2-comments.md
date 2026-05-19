# Branch Progress: feat/proposed-tabs-phase-2-comments

## Progress Update as of 2026-05-19 17:30 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Added `src/components/HighlightPopover.tsx` — a client component that listens for `selection-in-anchor` window events and renders a floating popover with Comment and (disabled) Suggest Changes buttons. This is Task 2.7 of 14. `tsc --noEmit` clean. No UI integration yet (Tasks 2.10–2.12).

### Detail of changes made:
- Created `src/components/HighlightPopover.tsx`:
  - Maintains a single `open: OpenDetail | null` state driven by `selection-in-anchor` CustomEvents (emitted by DocumentRenderer in Task 2.11).
  - Positions itself absolutely above the selection using `rect` from the event detail plus `window.scrollY`/`scrollX` offsets.
  - `mousedown` on `window` closes the popover; `onMouseDown` on the popover itself calls `stopPropagation` to prevent self-closing when clicking buttons.
  - "💬 Comment" button dispatches `compose-comment` CustomEvent — consumed later by `CommentComposer` (Task 2.8).
  - "✏️ Suggest Changes" button: disabled in Phase 2 (`enableSuggestChanges = false` default); shows "Coming soon" tooltip. Phase 3 will flip the prop to `true` and wire `compose-suggest`.
  - `OpenDetail` interface carries `anchorId`, `selectedText`, and `rect` — enough for the composer to pre-fill context.

### Potential concerns to address:
- `selection-in-anchor` event is not emitted yet — that lands in Task 2.11 (DocumentRenderer mouseup listener).
- Absolute positioning assumes the popover is inside a `position: relative` ancestor; if placed at the document root it will need `position: fixed` and viewport-relative coords instead.

---

## Progress Update as of 2026-05-19 17:15 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Added `src/components/AnchorSentence.tsx` — a client component that wraps a single anchored sentence with a hover-reveal comment-count badge. This is Task 2.6 of 14. `tsc --noEmit` clean. No UI integration yet (Tasks 2.10–2.12).

### Detail of changes made:
- Created `src/components/AnchorSentence.tsx`:
  - Renders a `<span>` with `data-anchor-id` so the parent `DocumentRenderer` `mouseup` listener can identify which anchor the user is interacting with.
  - Shows a small inline badge (count or `+`) that is `opacity-0` by default and `opacity-100` on `group-hover` via Tailwind.
  - Badge click dispatches `anchor-open-comments` CustomEvent with `{ anchorId }` so the future `CommentDrawer` (Task 2.11) can react without a direct React prop-drilling dependency.
  - No `mode` prop in Phase 2 — Task 3.6 will add that during the proposed-tab integration.
  - `count` prop drives the badge label: `💬 N` when N > 0, otherwise `+`.

### Potential concerns to address:
- The `anchor-open-comments` CustomEvent is consumed nowhere yet; the listener will land in Task 2.11 (CommentDrawer).

---

## Progress Update as of 2026-05-19 17:00 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Added `src/lib/comments/draft.ts` — a browser-only localStorage helper that persists unsubmitted comment and proposal drafts across Clerk OTP redirects. This is Task 2.5 of 14. `tsc --noEmit` clean. No tests (DOM/localStorage not exercised in vitest+pglite).

### Detail of changes made:
- Created `src/lib/comments/draft.ts` (new `src/lib/comments/` directory):
  - `DraftPayload` interface — covers both `comment` and `proposal` kinds in a single permissive shape; proposal-specific fields (`proposalKind`, `rationale`) are optional and ignored for comments.
  - `saveDraft(d)` — serializes to JSON and writes to `localStorage` under key `"abor-draft-v1"`. Stamps `ts` with `Date.now()` so expiry works even if caller forgets. No-ops in SSR (`window === "undefined"`) and swallows QuotaExceededError / private-mode errors.
  - `loadDraft()` — parses and returns the stored draft, or `null` if absent or older than 30 minutes.
  - `clearDraft()` — removes the key; called after successful submission.
  - Single key strategy (`abor-draft-v1`) — intentional; only one in-flight draft at a time, matching the UX design where only one composer is open at a time.
- This helper will be consumed by Task 2.8 (`CommentComposer`) and Task 3.4 (`SuggestChangesComposer`).

### Potential concerns to address:
- If a user opens two tabs simultaneously, the single-key approach means one draft can overwrite the other. Acceptable for MVP; could migrate to a per-anchor key later.
- 30-minute expiry is arbitrary; adjust if UX feedback indicates sessions routinely exceed this.

---

## Progress Update as of 2026-05-19 16:30 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Added `toggleCommentUpvote` (pure data-layer toggle) and `toggleCommentUpvoteAction` (auth + soft-ban Next.js Server Action) with full TDD (red → green). This is Task 2.4 of 14. Full suite: 54 passed (17 test files). `tsc --noEmit` clean.

### Detail of changes made:
- Created `src/server/actions/upvotes.ts`:
  - `toggleCommentUpvote(db, { commentId, signerId })` — pure data-layer function. Checks for an existing row in `commentUpvotes`; if present, deletes it and returns `{ state: "removed" }`; if absent, inserts and returns `{ state: "upvoted" }`. No auth or revalidation — keeps it testable in isolation.
  - `toggleCommentUpvoteAction(commentId)` — Next.js Server Action. Calls `auth()` from Clerk, looks up signer (returns error if missing), enforces `softBannedAt`, delegates to `toggleCommentUpvote`, calls `revalidatePath("/")`, returns `{ ok, state?, error? }`.
  - Uses the same lazy `getDb()` pattern (require-on-first-call) as other server actions to avoid instantiating the Neon client during tests.
- Created `tests/server/upvotes.test.ts` — 2 tests: insert-on-first-call returns `"upvoted"` and row exists; second call deletes and returns `"removed"` with zero rows remaining. Uses `createTestDb()` + `syncVersions()` + seeded comment row, following the pattern established in `comments.test.ts`.

### Potential concerns to address:
- `revalidatePath("/")` is still a broad invalidation; a future task could narrow this once document routing is finalized.
- `toggleCommentUpvote` accepts `db: any`, consistent with the rest of the codebase.

---

## Progress Update as of 2026-05-19 16:30 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Added `createComment` (pure data-layer insert) and `submitCommentAction` (auth + rate-limit + soft-ban Next.js Server Action) with full TDD (red → green). This is Task 2.3 of 14. Full suite: 52 passed (16 test files). `tsc --noEmit` clean.

### Detail of changes made:
- Created `src/server/actions/comments.ts`:
  - `createComment(db, input)` — pure data-layer function (no `auth()`, no `revalidatePath`). Trims body, throws `/empty/i` if blank, throws `/anchor.*or.*proposal/i` if both or neither of `anchorId`/`proposalId` are set, then inserts into `comments` and returns `{ id }`.
  - `submitCommentAction(formData)` — Next.js Server Action. Calls `auth()` from Clerk, looks up signer row (returns error if none), enforces `softBannedAt`, runs `enforceRateLimit` (20 comments/hour window), then delegates to `createComment`. Calls `revalidatePath("/")` on success. Returns `{ ok, error? }` (never throws to the client).
  - Uses the lazy `getDb()` pattern (require-on-first-call) to keep tests from instantiating the Neon client, consistent with `sign.ts`, `me.ts`, etc.
- Created `tests/server/comments.test.ts` — 3 tests covering: successful insert + body trim, empty-body rejection, and missing-anchor validation. Uses `createTestDb()` + `syncVersions()` following the established pattern in `sign.test.ts`.

### Potential concerns to address:
- `revalidatePath("/")` is a broad cache invalidation — a future improvement would revalidate only the relevant document path once routing is finalized.
- `createComment` accepts `db: any` (consistent with the rest of the codebase). A typed Drizzle db type could be introduced as a follow-up.

---

## Progress Update as of 2026-05-19 16:15 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Added `countCommentsByAnchor` and `listCommentsForAnchor` query functions to `src/lib/db/queries.ts` with full TDD (red → green cycle confirmed). This is Task 2.2 of 14.

### Detail of changes made:
- Modified `src/lib/db/queries.ts`: added `asc` to the drizzle-orm import (existing `and`, `isNull`, `eq` were already present); added `comments` to the schema import alongside the existing `versions`, `signatures`, `signers`. Appended `CommentRow` interface plus `countCommentsByAnchor(db, baseVersionId)` and `listCommentsForAnchor(db, baseVersionId, anchorId)` exports at the end of the file.
- `countCommentsByAnchor`: selects all non-hidden (`hiddenAt IS NULL`) comments for a version, then aggregates counts in JS keyed by `anchorId`. Returns `Record<string, number>` — only anchor IDs with at least one visible comment appear in the map.
- `listCommentsForAnchor`: inner-joins `comments` with `signers` to get `displayName`, filters by `baseVersionId`, `anchorId`, and `hiddenAt IS NULL`, orders `ASC` by `createdAt` (oldest-first).
- Both functions take an explicit `db` as first arg (matching the pattern used by `countCommentsByAnchor` etc. in the file), with no default — callers always supply the db in tests; production callers will supply it from the route handler.
- Created `tests/lib/db.queries.comments.test.ts` with two tests: one for `countCommentsByAnchor` (inserts 4 comments, 1 hidden, expects `{preamble-s-1: 2, preamble-s-2: 1}`), one for `listCommentsForAnchor` (inserts 3 comments across 2 anchors, expects 2 rows for the target anchor in insertion order with correct `displayName`).
- Full test suite: 49 passed (15 test files). `tsc --noEmit` clean.

### Potential concerns to address:
- `countCommentsByAnchor` uses in-process aggregation rather than a SQL `GROUP BY` + `COUNT(*)`. This is fine for the expected comment volumes per document version, but if counts ever need to be computed for thousands of rows a SQL-level aggregation would be preferable.
- Both queries use `db: any` type, consistent with the rest of the file. A typed Drizzle db type could be introduced as a follow-up cleanup.

---

## Progress Update as of 2026-05-19 16:15 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Added the DB-backed sliding-window rate limiter (`enforceRateLimit`) as the first building block of Phase 2 (per-sentence Comments). This is Task 2.1 of 14.

### Detail of changes made:
- Created `src/lib/ratelimit/enforce.ts` — exports a single `enforceRateLimit(db, opts)` function. It executes a caller-supplied `countSql` string (with `$1` replaced by the escaped `signerId`), reads back the count column `n`, and throws an Error matching `/rate/i` if `n >= opts.max`. Uses `sql.raw()` from drizzle-orm; no other drizzle abstractions needed since each caller's count query is different.
- Created `tests/lib/ratelimit.enforce.test.ts` — seeds a pglite in-memory DB via `createTestDb()` + `syncVersions()`, inserts a signer, runs 5 comment inserts (each preceded by `enforceRateLimit`), then asserts the 6th call throws. Uses `vitest`; test runs in ~800 ms.
- The `countSql` design is intentional: comments, proposals, and upvotes all rate-limit against different tables/columns, so a generic "pass your own SQL" pattern is simpler than a factory with drizzle builders. `signerId` is the only interpolated value and is single-quote-escaped.
- `tsc --noEmit` is clean; no new public exports added beyond the one function.

### Potential concerns to address:
- `sql.raw()` with string interpolation is safe only because `signerId` comes from Clerk (UUID format). If any future caller passes arbitrary user-typed text as `signerId` the escaping must be audited — the existing `replace(/'/g, "''")` handles standard SQL injection but is not parameterised.
- The `countSql` window clause must stay in sync with `windowSec` manually; there is no runtime check that the SQL interval matches the number. A future improvement could parse or enforce alignment.

---
