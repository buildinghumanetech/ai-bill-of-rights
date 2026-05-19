# Branch Progress: feat/proposed-tabs-phase-2-comments

## Progress Update as of 2026-05-19 16:45 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Task 2.12 complete. The homepage (`src/app/page.tsx`) now serves the AI Bill of Rights through `DocumentRenderer` with per-sentence anchor IDs and comment counts pulled from the DB, replacing the hardcoded `articles` array. `HighlightPopover` and `CommentDrawer` are slotted in as fixed-position overlays at the bottom of the root `<div>`.

### Detail of changes made:
- Modified `src/app/page.tsx`:
  - Added imports: `CommentDrawer`, `HighlightPopover`, `DocumentRenderer`, `ParsedDocument`, `countCommentsByAnchor`, `listCommentsForAnchor`, `getCurrentVersion`.
  - Converted `Home` from a sync function to `async` (server component data-fetching pattern).
  - Before the return, calls `getCurrentVersion()`, then `countCommentsByAnchor()` and `listCommentsForAnchor()` for each anchor that has comments; wrapped in try/catch so DB unavailability in preview silently yields empty maps.
  - `undefined as any` is the db argument pattern — consistent with how `getDefaultDb()` lazy-requires the real DB at call time.
  - Replaced the hardcoded `<ol>{articles.map(...)}` block with `<DocumentRenderer document={current.parsedJson as unknown as ParsedDocument} anchorCounts={anchorCounts} />`.
  - Added `<HighlightPopover enableSuggestChanges={false} />` and `<CommentDrawer baseVersionId={current.id} commentsByAnchor={commentsByAnchor} />` as the last children of the root `<div>` (outside the article section, so they render as fixed-position overlays).
  - Removed: `PILL_COLORS` constant, `pillColor()` helper, `articles` array constant — all unused.
- Smoke test: dev server returned 200.
- `pnpm exec tsc --noEmit`: clean (no output).
- `pnpm test`: 54/54 pass.

### Potential concerns to address:
- **Intentional UX regression**: The curated pull quotes (blockquotes per article) and "Connects to" pills (links to /resources/ slugs) from the previous hardcoded layout are gone. The document is now driven entirely by the parsed markdown. Per the plan, restoring those as parsed metadata is a follow-up phase.
- If `getCurrentVersion()` returns null (no version seeded in DB), the articles section renders nothing — the UI will show just the header/hero/footer with an empty middle. This is acceptable for now but worth noting.

---

## Progress Update as of 2026-05-19 16:30 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Task 2.11 complete. Extracted the non-readOnly render path out of `DocumentRenderer` into a new `InteractiveDoc` client component. `InteractiveDoc` wraps each sentence in `AnchorSentence` (count badges) and installs a `mouseup` listener that detects selections within `data-anchor-id` spans and dispatches a `selection-in-anchor` custom event. `DocumentRenderer` stays a server component; only the `readOnly=true` branch is unchanged.

### Detail of changes made:
- Created `src/components/InteractiveDoc.tsx`:
  - `"use client"` component; accepts `document: ParsedDocument` and `anchorCounts: Record<string, number>`.
  - `containerRef` attached to the `<article>` element. `useEffect` installs/cleans up a `mouseup` handler.
  - `mouseup` handler: walks up from `sel.anchorNode` to find the nearest `data-anchor-id` attribute, then dispatches `selection-in-anchor` with `{ anchorId, selectedText, rect }` — rect from `range.getBoundingClientRect()`.
  - Renders articles/paragraphs/sentences identical to the old non-readOnly branch, but sentences are now `<AnchorSentence>` elements (with count badges) instead of plain `<span>` elements.
- Modified `src/components/DocumentRenderer.tsx`:
  - Added `import { InteractiveDoc } from "./InteractiveDoc"`.
  - Added `anchorCounts?: Record<string, number>` to Props (default `{}`).
  - Non-readOnly return replaced with `<InteractiveDoc document={document} anchorCounts={anchorCounts} />`.
  - `readOnly=true` branch left 100% unchanged.

### Potential concerns to address:
- `DocumentRenderer` callers that don't pass `anchorCounts` will get an empty map (badges show `+`). Task 2.12 will wire in real counts from the DB query.
- `selection-in-anchor` event has no consumer yet — `HighlightPopover` will listen for it in Task 2.12.

---

## Progress Update as of 2026-05-19 18:30 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Added `src/components/CommentDrawer.tsx` — a client component (Task 2.10) that renders the right-side slide-in panel for per-anchor discussion. Listens for `anchor-open-comments` and `compose-comment` window events. `tsc --noEmit` clean.

### Detail of changes made:
- Created `src/components/CommentDrawer.tsx`:
  - Props: `baseVersionId` and `commentsByAnchor: Record<string, CommentRow[]>` (pre-fetched at SSR time to avoid per-anchor round-trips).
  - State: `openAnchor` (which anchor's drawer is visible) and `composeAnchor` (whether the inline composer is open).
  - `useEffect` wires two window event listeners:
    - `anchor-open-comments` → sets `openAnchor`, clears `composeAnchor` (view-only mode).
    - `compose-comment` → sets both `openAnchor` and `composeAnchor` (opens drawer directly to compose).
  - Returns `null` when `openAnchor` is null (drawer hidden).
  - Layout: `fixed right-0 top-0 z-40` full-height panel, `sm:w-96` / `w-full max-w-md`.
  - Header shows anchor ID in monospace + Close button.
  - Body: scrollable `CommentThread` with SSR-fetched comments.
  - Footer: toggling between `CommentComposer` and "Add a comment" button.
  - `commentsByAnchor[openAnchor] ?? []` safely falls back to empty array if no comments pre-fetched.

### Potential concerns to address:
- Drawer does not re-fetch comments when opened — it uses the SSR snapshot. After `router.refresh()` (triggered by `CommentComposer` and `CommentThread`), the parent page will re-render and pass fresh `commentsByAnchor` down.
- `anchor-open-comments` and `compose-comment` event emitters land in Task 2.11 (DocumentRenderer) and Task 2.6 (AnchorSentence) respectively.

---

## Progress Update as of 2026-05-19 18:15 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Added `src/components/CommentThread.tsx` — a client component (Task 2.9) that renders a threaded list of comments with one-level reply nesting and per-comment upvote. `tsc --noEmit` clean.

### Detail of changes made:
- Created `src/components/CommentThread.tsx`:
  - Accepts `comments: CommentRow[]`, `baseVersionId`, optional `anchorId` and `proposalId`.
  - Builds a `childrenByParent` map from `c.parentCommentId` to support tree rendering without recursive DB queries.
  - `renderComment(c, depth)` returns `React.ReactNode` — renders author name, body, Upvote and Reply buttons.
  - Reply button only shown at `depth < 1` (one level of nesting max); clicking toggles `replyingTo` state.
  - Inline `CommentComposer` shown when `replyingTo === c.id`; `onSubmitted`/`onCancel` both clear the reply state.
  - `handleUpvote` calls `toggleCommentUpvoteAction` then `router.refresh()` to sync server state.
  - Empty state: renders "No comments yet." paragraph.

### Potential concerns to address:
- `renderComment` uses `key={c.id}` inside the function body — React may not reconcile correctly if the function is re-called without a stable list. This is fine for Phase 2 but worth converting to a proper component in Phase 3.

---

## Progress Update as of 2026-05-19 18:00 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Added `src/components/CommentComposer.tsx` — a client-side form component (Task 2.8) that handles both authenticated comment submission and anonymous-then-OTP draft handoff. `tsc --noEmit` clean. `useSignUp` import removed (unused in this file).

### Detail of changes made:
- Created `src/components/CommentComposer.tsx`:
  - Accepts `baseVersionId`, optional `anchorId`, `proposalId`, `parentCommentId`, `defaultBody`, `onSubmitted`, and `onCancel` props.
  - For signed-in users: builds a `FormData` object and calls `submitCommentAction`, then calls `clearDraft()`, resets textarea, and triggers `router.refresh()`.
  - For anonymous users: calls `saveDraft()` with a `kind: "comment"` payload (including `returnTo` = current path + `?draft=1`), then dispatches `open-sign-modal` CustomEvent to trigger the Clerk OTP modal.
  - Error state displayed inline below the textarea as a red pill.
  - Submit button label adapts: "Post" when signed in, "Sign in & post" when anonymous, "Saving…" during transition.
  - Cancel button is conditionally rendered only when `onCancel` prop is provided.
  - Removed `useSignUp` import — it was in the plan spec but not used in this file.

### Potential concerns to address:
- `open-sign-modal` CustomEvent consumer not yet wired — will be handled in Task 2.12 when the modal is integrated into the homepage.

---

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
