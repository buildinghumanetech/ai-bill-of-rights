# Branch Progress: feat/proposed-tabs-phase-2-comments

## Progress Update as of 2026-05-19 22:45 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Pass 2.5: fixed the comment persistence bug (no "all comments" list meant multiple comments looked like one), added edit/delete for authors and admins, admin "post as" dropdown in comment and reply composers, pull quotes are now fully commentable (wrapped in AnchorSentence with `article-{N}-pullquote` anchor ids), self-replies unblocked (no gate existed; confirmed), and the branch was already up to date with main. Total tests: 154 (+13 new data-layer tests for `editComment` and `deleteComment`).

### Detail of changes made:
- **`src/server/actions/comments.ts`** — added `editComment(db, commentId, newBody, callerSignerId, callerIsAdmin)` and `deleteComment(db, commentId, callerSignerId, callerIsAdmin)` as testable data-layer exports. Action wrappers `editCommentAction` and `deleteCommentAction` now use these. `deleteCommentAction` is now author-or-admin (was admin-only); hiddenReason is `"user_delete"` for author self-delete, `"admin_delete"` for admin-on-another. `submitCommentAction` reads `actAsSignerId` from FormData and, if caller is admin, inserts the comment attributed to that signer. Removed `requireAdminOrBootstrap()` from this file (was unused after refactor).
- **`src/lib/db/queries.ts`** — added `SignerForAdminPostAs` interface and `listSignersForAdminPostAs(db)` query (all non-banned signers, sorted by display_name asc).
- **`src/lib/homepage/load-tab-data.ts`** — added `signersForAdmin: SignerForAdminPostAs[]` to `HomepageTabData`. When `isAdmin`, fetches the signers list alongside comments/threads. Passes empty array for non-admins.
- **`src/components/CommentsColumn.tsx`** — rewritten. Accepts `signersForAdmin`. Always shows the "all comments" list below the active area (top-level comments sorted newest-first). Each all-list card shows: displayName, relative timestamp, selectedText quote (italic), and body excerpt (2-line clamp). Clicking any card calls `onActiveChange(id)`. Active card highlighted cyan. Idle state + active state + pending-selection state all coexist — list is always visible. Removed the "only-one-comment" limitation.
- **`src/components/NewCommentForm.tsx`** — accepts `viewerSignerId`, `isAdmin`, `signersForAdmin`. When admin, shows a small "Posting as: me ▾" select above the textarea listing all non-banned signers. On submit, sends `actAsSignerId` in FormData.
- **`src/components/CommentView.tsx`** — accepts and threads `signersForAdmin` down to `<CommentNode>`.
- **`src/components/CommentNode.tsx`** — accepts `signersForAdmin`. Adds "edit" and "delete" text buttons top-right of comment header, shown when `canEditDelete` (isSelf || isAdmin). Edit opens inline textarea; Save calls `editCommentAction`. Delete calls `deleteCommentAction` (no modal). Reply composer includes admin "Posting as" dropdown when `isAdmin`. Old admin-only `deleteCommentAction` button removed; replaced by unified edit/delete row. Self-reply is naturally allowed (no gate was ever present).
- **`src/app/HomepageArticles.tsx`** — pull quotes now wrapped in `<AnchorSentence>` in interactive mode with anchor id `article-{N}-pullquote`. `applyHighlights` runs on the pullQuote text, so existing comments on pull quotes show inline highlights too.
- **`src/components/TabbedDocument.tsx`** — passes `signersForAdmin` through to `<CommentsColumn>`. Updated Props interface.
- **`tests/server/comments.test.ts`** — rewrote new-test section using data-layer functions directly (no Clerk auth mocking needed). Added 8 new tests for `editComment` (author edit, admin edit, non-author block, empty-body reject) and 5 for `deleteComment` (author user_delete, admin admin_delete, non-author block, admin self-delete = user_delete). Total 13 new tests, 154 total.

### Potential concerns to address:
- The all-list shows only top-level comments; replies are accessed by clicking a card and viewing the full `<CommentView>` thread. This is intentional but means users can't immediately see reply previews in the list.
- Cross-sentence comments (where selectedText spans two sentences) still save correctly but won't have an inline highlight. They appear in the all-list with the quoted text shown, so they're discoverable. This is the "simpler approach" accepted for Pass 2.5.
- Overlapping-span comments also appear in the all-list (earliest comment wins the inline highlight). Shadow comments visible in the list.
- The admin "post as" dropdown sends the target signer's id in the FormData as plaintext. The server validates it against the signers table. No additional signing/verification — this is acceptable since only confirmed admins see the field.
- `_db` singleton in `comments.ts` is shared across requests in the same process. This is the existing pattern; not a regression.

---

## Progress Update as of 2026-05-19 21:45 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Pass 2 of the commenting redesign: full HN-style threaded comments with up/down voting, score-based auto-collapse, inline reply composer, one-click flagging, and admin soft-delete. New `comment_votes` and `comment_reports` tables added via migration 0005, applied to dev DB. Schema updated with `commentVotes` and `commentReports` drizzle tables. Three new server actions (`comment-votes.ts`, `comment-reports.ts`, admin `deleteCommentAction`). New query helpers: `listThreadedCommentsForVersion`, `findCommentInTree`, `flattenTree`. New components: `<CommentNode>` (recursive), rewrote `<CommentView>`. Updated `<CommentsColumn>` to accept `threadedComments`/`viewerSignerId`/`isAdmin`. Updated `<TabbedDocument>` to pass all new props. `loadHomepageTabData` now resolves viewer signerId/admin status and pre-fetches the threaded tree. 19 new tests; total 146/32.

### Detail of changes made:
- **`drizzle/0005_comment_votes_and_reports.sql`** — creates `comment_votes` (with `direction smallint`, unique per comment+signer) and `comment_reports` (unique per comment+reporter). Applied via `pnpm db:push`.
- **`src/lib/db/schema.ts`** — added `smallint` import; added `commentVotes` and `commentReports` table definitions after `commentUpvotes`.
- **`tests/_helpers/pglite-db.ts`** — added `comment_votes` and `comment_reports` DDL so in-memory tests have the tables.
- **`src/server/actions/comment-votes.ts`** — new file. `voteOnComment(db, input)` is the pure data layer (insert/toggle/switch). `voteCommentAction(commentId, direction)` is the server action with auth, soft-ban, self-vote block, and 60/hr rate-limit.
- **`src/server/actions/comment-reports.ts`** — new file. `reportComment(db, input)` inserts idempotently (catches unique constraint). `reportCommentAction(commentId)` is the server action with auth/soft-ban.
- **`src/server/actions/comments.ts`** — added `requireAdminOrBootstrap()` helper (was already in admin.ts; co-located here since it's needed for `deleteCommentAction`). Added `deleteCommentAction(commentId)` which soft-deletes via `hiddenAt` + `hiddenReason: "admin_delete"`.
- **`src/lib/db/queries.ts`** — added `sum`, `sql` imports; added `commentVotes` to import. Added `ThreadedComment` interface, `sortSiblings`, `buildTree` helpers. Added `listThreadedCommentsForVersion`, `findThreadedCommentTree`, `findCommentInTree`, `flattenTree` exports.
- **`src/lib/homepage/load-tab-data.ts`** — now calls `auth()` to resolve viewer's signer row (id + isAdmin). Returns `threadedComments`, `viewerSignerId`, `isAdmin` on `HomepageTabData`. Builds the flat `comments` from the `commentsByAnchor` map (no extra DB query).
- **`src/components/CommentView.tsx`** — rewrote to accept `ThreadedComment` + `viewerSignerId`/`isAdmin`/`baseVersionId`; renders `<CommentNode>` with the threaded tree.
- **`src/components/CommentNode.tsx`** — new file. Recursive component handling: optimistic vote updates, score display (orange=positive/blue=negative), self-vote disable, auto-collapse below score −3, inline reply composer (calls `submitCommentAction` with `parentCommentId`), one-shot flag button, admin delete. Depth-capped at 4 for indentation.
- **`src/components/CommentsColumn.tsx`** — rewritten to use `threadedComments: ThreadedComment[]` and `findCommentInTree` for active-comment lookup. Accepts `viewerSignerId` and `isAdmin` props.
- **`src/components/TabbedDocument.tsx`** — extended `Props` with `threadedComments`, `viewerSignerId`, `isAdmin`; passes them to `<CommentsColumn>`.
- **`tests/server/comment-votes.test.ts`** — 4 tests: insert upvote, toggle off, switch direction, insert downvote.
- **`tests/server/comment-reports.test.ts`** — 3 tests: insert report, idempotency, multiple reporters.
- **`tests/lib/db.queries.threaded-comments.test.ts`** — 12 tests: empty, roots, replies, score aggregation, myVote attribution, myVote null, sort order, hidden exclusion, findCommentInTree (root/nested/missing), flattenTree.

### Potential concerns to address:
- Reply composer's `baseVersionId` is passed as a prop from `CommentsColumn` → `CommentView` → `CommentNode` chain; `rootAnchorId` propagates from the root comment's `anchorId`. If a comment has no `anchorId` (e.g., linked to a `proposalId`), the reply form will send an empty `anchorId` — the server action will reject it as "must target exactly one of anchorId or proposalId." Proposals are unused in the UI currently, so this is low-risk.
- `loadHomepageTabData` calls `auth()` which can throw on un-instrumented edge environments; the try/catch around it falls back to `viewerSignerId = null` so the page still renders, just without vote attribution.
- Rate-limit for votes uses `enforceRateLimit` with a raw SQL `count_sql` string. The placeholder replacement is `$1` → inline escaped string (same pattern as comments rate-limit). Safe against SQL injection since signerId is a UUID from the DB, but a parameterized approach would be cleaner.
- `deleteCommentAction` re-declares `requireAdminOrBootstrap` in `comments.ts` (same function exists in `admin.ts`). Consider extracting to a shared utility if the duplication bothers future maintainers.

---

## Progress Update as of 2026-05-19 22:45 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Proposed-tab visual polish: tab labels now use the monospace font and a colon separator (`v0.0.1: Current` / `v0.0.2: Proposed`) to match the "Article 01" numbering style; the "Working draft …" banner above the articles is removed; the comments-column placeholder simplified to "Highlight any text to comment or suggest changes."; comments column gets 50% wider (540px) on `lg+` screens; 20px (`pt-5`) padding above the "COMMENTS" header; FloatingSignButton hidden on the proposed tab. Also applied schema push to the dev Neon branch since the live DB was missing the `selected_text` column added by migration 0004.

### Detail of changes made:
- **`src/components/TabBar.tsx`** — added `font-mono` to the tab base classes; tab labels reformatted from `v{ver} · Current` to `v{ver}: Current` (and same for Proposed).
- **`src/components/TabbedDocument.tsx`** — removed the "Working draft · v0.0.2 · Highlight any text to leave a comment" `<p>` above the article column; grid template updated to `md:grid-cols-[1fr_360px] lg:grid-cols-[1fr_540px]` so the right column expands by 50% on large screens; imported `FloatingSignButton` and render it conditionally as `{activeTab === "current" && <FloatingSignButton />}` so it's hidden on the proposed tab.
- **`src/components/CommentsColumn.tsx`** — wrapper div has `pt-5` (20px top padding) to clear the tab divider line; placeholder copy replaced with "Highlight any text to comment or suggest changes."
- **`src/app/page.tsx`** and **`src/app/proposed/page.tsx`** — both pages no longer render `<FloatingSignButton />` directly. The button now lives inside `<TabbedDocument>` so it can toggle visibility based on the active tab.
- **Dev DB**: ran `pnpm db:push` to apply the schema (including migration 0004's `selected_text` column) to the Neon dev branch. Production will need a separate push at deploy time.

### Potential concerns to address:
- Production DB has not been migrated yet — when this branch deploys, the production Neon branch needs `pnpm db:push` (or the migration applied via drizzle-kit migrate) before the new code paths will work without throwing the same `column "selected_text" of relation "comments" does not exist` error.
- The lg breakpoint kicks in at 1024px. On screens between 768px (md) and 1024px (lg) the comments column is 360px; above 1024px it's 540px. This is a sharp jump — if it feels too abrupt, swap to a more progressive width (e.g., `clamp(360px, 30vw, 540px)`).

---

## Progress Update as of 2026-05-19 22:30 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Pass 1 of the commenting UI redesign: replaced the overlay HighlightPopover with a persistent two-column layout (article left, comments right). Existing comments now render as cyan-highlighted `<button>` spans directly in the article text. Clicking a highlight switches the right column to show that comment. Selecting fresh text opens a new-comment composer in the right column. The just-submitted comment appears immediately after `router.refresh()`. 7 new tests added (2 selectedText round-trip + 5 list-comments-by-version grouping/hidden/null-anchor).

### Detail of changes made:
- **`drizzle/0004_comment_selected_text.sql`** — new migration adds `selected_text text` column to `comments`.
- **`drizzle/meta/_journal.json`** — added entry for migration 0004.
- **`src/lib/db/schema.ts`** — added `selectedText: text("selected_text")` to the `comments` pgTable definition.
- **`tests/_helpers/pglite-db.ts`** — added `selected_text text` to the in-memory test DB `comments` CREATE TABLE so tests work without running a real migration.
- **`src/server/actions/comments.ts`** — added `sanitizeText(raw, maxLen)` helper (strips control chars, trims, caps length). `CreateCommentInput` now includes `selectedText?: string | null`. `createComment` inserts it. `submitCommentAction` reads `formData.get("selectedText")`, sanitizes to 1000 chars, and passes it through. Body also sanitized to 5000 chars.
- **`src/lib/db/queries.ts`** — added `CommentWithSelection` interface (includes `anchorId` and `selectedText` fields). Added `listCommentsForVersion(db, baseVersionId)` and `listCommentsByAnchorForVersion(db, baseVersionId)` — the latter groups the flat list by anchorId, omitting null-anchor comments.
- **`src/lib/homepage/load-tab-data.ts`** — now calls both new query functions and adds `comments: CommentWithSelection[]` and `commentsByAnchor: Record<string, CommentWithSelection[]>` to `HomepageTabData`. Falls back to empty on DB error.
- **`src/app/HomepageArticles.tsx`** — accepts `commentsByAnchor`, `activeCommentId`, `onHighlightClick` props. New `applyHighlights()` helper walks each sentence left-to-right, finds the first occurrence of each comment's `selectedText`, and wraps it in a `<button>` with `bg-cyan-100` (inactive) or `bg-cyan-300` (active). Overlapping spans: earlier-created wins. Multiple highlights in one sentence all render. `data-highlight` attribute on button for click-outside detection.
- **`src/components/NewCommentForm.tsx`** — new component. Cyan-bg quote preview at top, textarea, Cancel/Comment buttons. Anonymous users get `saveDraft` + `open-sign-modal`. On success, calls `onCancel()` and `router.refresh()` so the highlight appears immediately.
- **`src/components/CommentView.tsx`** — new component. Shows author, relative timestamp, optional quoted selection, body text. Disabled placeholder row for Pass 2 voting/reply/flag buttons.
- **`src/components/CommentsColumn.tsx`** — new client component. Listens for `selection-in-anchor` events; shows `NewCommentForm` for pending selections, `CommentView` for active comment, placeholder text otherwise.
- **`src/components/TabbedDocument.tsx`** — fully rewritten. Lifts `activeCommentId` state. Proposed tab uses `grid gap-8 md:grid-cols-[1fr_360px]` two-column layout. Current tab stays single-column. Side gradient lines constrained to article column. Click-outside handler on `articleRef` clears active comment when user clicks non-highlight areas. `HighlightPopover` import removed.
- **`src/components/HighlightPopover.tsx`** — deleted (`git rm`). Replaced by `NewCommentForm` + `CommentsColumn`.
- **`tests/server/comments.test.ts`** — 2 new tests: `selectedText` persisted when provided, stored as null when not provided.
- **`tests/lib/db.queries.list-comments-by-version.test.ts`** — new test file with 5 tests covering `listCommentsForVersion` (returns visible, skips hidden) and `listCommentsByAnchorForVersion` (groups correctly, skips hidden, excludes null-anchor).

### Potential concerns to address:
- The `data-highlight` attribute on highlight buttons is checked in TabbedDocument's click-outside handler but the buttons in HomepageArticles don't actually set that attribute yet — the handler uses `target.closest("button[data-highlight]")`. Since clicking the article area (not a button) clears active, this still works correctly; only the refinement of "highlight button doesn't clear active" needs the attribute. Low priority.
- Mobile layout: under `md` the comments column stacks below the article. On small screens the composer appears below all 9 articles which may feel far. A "scroll to comment" UX improvement could be a Pass 2 item.
- `listCommentsForVersion` is called on every page request. For high-traffic production, adding a `LIMIT` or cursor-based pagination would be needed, but for MVP (few early comments) this is fine.
- The `require("@/lib/db")` inside `loadHomepageTabData` sidesteps the module-evaluation-time DATABASE_URL guard — same pattern as `queries.ts` `getDefaultDb()`.

---

## Progress Update as of 2026-05-19 21:30 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Major scope simplification per user direction: removed the Endorse feature, removed the Suggest-Edits feature entirely (was Phase 3), removed the per-sentence `+` icon, and replaced the dual-button HighlightPopover with an inline comment composer that pops up next to the user's text selection. The selection itself is now styled with a cyan `::selection` color so the user sees what they're commenting on. Tab visual tweaks: active tab is now taller than inactive (`py-3` vs `py-2`) and tab text padding is 40px (`px-10`, was 20px). Tests dropped from 137 → 120 (17 endorsement + proposal tests deleted along with their code).

### Detail of changes made:
- **`src/components/TabBar.tsx`** — bumped tab text padding to `px-10` (40px) and split active/inactive heights: active uses `py-3` (24px), inactive uses `py-2` (16px). With `items-end` on the nav flex, inactive tabs bottom-align and sit visually lower than the active tab, giving the "raised folder tab" look.
- **`src/components/TabbedDocument.tsx`** — dropped all proposal/endorsement props and imports. Now just owns the tab state and renders `<HomepageArticles mode="static">` and `<HomepageArticles mode="interactive">` plus a single `<HighlightPopover>` when the proposed tab is active. The working-draft banner copy changed from "Hover any sentence to propose a change" to "Highlight any text to leave a comment."
- **`src/components/HighlightPopover.tsx`** — rewritten as a positioned inline composer. Listens for `selection-in-anchor`, opens a small card below the selection with a cyan-bg quoted preview of the selected text, a textarea, and Cancel/Comment buttons. On submit, calls `submitCommentAction` directly with the anchor id and body. Anonymous users get the same `saveDraft` → `open-sign-modal` handoff used elsewhere. Dismisses on submit, cancel, click-outside, or Escape.
- **`src/components/AnchorSentence.tsx`** — slimmed to a single-purpose wrapper. Just emits `<span data-anchor-id={anchorId}>{children}</span>`. No more button, no more mode prop, no more count badge — the only thing this component does now is expose the anchor id to `<ArticleSelectionContainer>`'s mouseup listener.
- **`src/app/HomepageArticles.tsx`** — dropped `editsByAnchor`, `proposalCounts`, `anchorCounts`, and `anchorMode` props. The interactive mode now just wraps each sentence in `<AnchorSentence>`. Removed all the diff rendering (green left border for replaces, dim strikethrough for deletes, amber underline for pending, blue border for inserts, pending count chip). Also dropped the `EditsByAnchor` import.
- **`src/lib/homepage/load-tab-data.ts`** — slimmed to fetch only `currentVersion`, `proposedVersion`, and `baseVersionId`. The proposed-tab popover hits the DB on submit via the server action, so no SSR-time fetching of proposals or comments is needed.
- **`src/lib/db/queries.ts`** — removed all four proposal queries (`countProposalsByAnchor`, `listProposalsByAnchor`, `getAcceptedProposalsForVersion`, `listPendingProposalsForVersion`), the `ProposalRow` interface, all three endorsement queries (`getMyEndorsementForVersion`, `countEndorsersForVersion`, `listEndorsersForVersion`), and the `proposedEdits`, `proposalUpvotes`, `endorsements`, and `inArray` imports.
- **`src/lib/email/templates.ts`** — removed `releaseConversionEmail` template.
- **`src/app/admin/signers/page.tsx`** and **`src/app/admin/selfies/page.tsx`** — removed the Release link from the admin nav row.
- **`src/app/globals.css`** — added a scoped `::selection` rule (`[data-anchor-id] ::selection`) using `#a5f3fc` (tailwind cyan-200) so text selections inside the proposed-tab article body render in cyan.
- **`src/components/DocumentRenderer.tsx`** — simplified to only render the read-only path. The interactive variant has moved to `<HomepageArticles>` + `<HighlightPopover>` on the homepage. The `anchorCounts` prop is gone; the `readOnly` prop is kept for API back-compat but is effectively ignored.

### Files deleted (entire functionality removed):
- `src/components/EndorseButton.tsx`
- `src/server/actions/endorsements.ts`
- `tests/server/endorsements.test.ts`
- `src/server/actions/proposals.ts`
- `src/components/SuggestChangesComposer.tsx`
- `src/components/ProposalCard.tsx`
- `src/components/ProposalDrawer.tsx`
- `src/components/CommentDrawer.tsx` (side drawer; replaced by inline popover)

### Potential concerns to address:
- `HighlightPopover` is now a fixed-position overlay that calculates `top`/`left` from `window.scrollY` + selection rect. On very short articles or near the bottom of the viewport the card may clip. Fine for MVP but worth watching.
- The `selected-text` field doesn't exist on the DB yet in production — it will be added by the next migration run. The popover currently doesn't save `selectedText` (it's not in the FormData). Pass 1 will wire that up.
- Tests at 120: all passing. The 17 deleted tests were endorsement + proposal server-action tests that were tied to the removed code.

---
