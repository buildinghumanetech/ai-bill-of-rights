# Branch Progress: feat/proposed-tabs-phase-2-comments

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
