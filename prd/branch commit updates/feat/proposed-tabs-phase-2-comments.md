# Branch Progress: feat/proposed-tabs-phase-2-comments

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
- `src/components/CommentThread.tsx` (only consumed by the drawer)
- `src/lib/proposed/apply-edits.ts` + `src/lib/proposed/` directory
- `src/app/admin/proposals/page.tsx` + directory
- `src/app/admin/release/page.tsx` + directory
- `tests/server/proposals.test.ts`
- `tests/lib/proposed.apply-edits.test.ts`
- `tests/lib/db.queries.proposed-edits.test.ts`
- `src/components/InteractiveDoc.tsx` (older markdown-based interactive doc — was dead code after the homepage moved to articles[])

### What was NOT deleted (intentionally):
- The DB schema (`proposed_edits`, `proposal_upvotes`, `endorsements` tables) and migration `0001_add_comments_and_proposed_edits.sql`. Rolling back migrations is destructive — existing rows in dev/prod are now orphaned but harmless.
- `src/lib/db/schema.ts` table declarations for the above (same reason).
- `tests/_helpers/pglite-db.ts` table creation for `endorsements` (matches the migration; harmless).
- `tests/lib/db.proposed-edits-schema.test.ts` (asserts the schema round-trips — still valid).

### Outstanding work (not in this commit):
- HN-style comments per user's latest message: upvotes, downvotes, threaded replies, flagging, admin delete, body sanitization. Needs a new `comment_votes` (signed direction) table, a new `comment_reports` table, comment list UI showing existing comments per anchor (currently the user can post but can't see existing comments), and an admin comment-moderation enhancement. To be built next.

### Potential concerns to address:
- `/admin/proposals` and `/admin/release` URLs return 307 from the dev server (cached); a fresh build will 404 them as the route files are gone. Old shared links to those URLs will hit a 404 — no migration of those pages was kept.
- After comment submission via `<HighlightPopover>`, the user has no way to see the comment they just posted on the page. The popover dismisses on success but no comment thread is shown. This is intentionally minimal — the HN-style follow-up work will add the visible threaded comments section.
- The CommentComposer component (`src/components/CommentComposer.tsx`) is no longer used by any caller; the new popover has its own composer inline. Leaving it in for now in case the HN-style work needs the same pattern; will delete if not reused.

---

## Progress Update as of 2026-05-19 21:15 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Added 48px (`sm:px-12`) horizontal padding to the article area inside `<TabbedDocument>` so the articles sit further inside the fading vertical lines. Mobile (`<sm`) keeps the lines tight to the content to avoid cramping; on `sm`-and-up there's now ~48px of breathing room on each side between the article text and the gradient lines.

### Detail of changes made:
- **`src/components/TabbedDocument.tsx`** — added `sm:px-12` to the inner `relative` wrapper that contains the two article views. The gradient lines (`absolute inset-y-0 left-0 / right-0`) stay pinned to the wrapper edges; the children (the `<HomepageArticles>` instances) get pushed inward by the padding. On mobile, the padding is zero so the constrained viewport doesn't shrink article text further.

### Potential concerns to address:
- None. Visual tweak, no behavior change.

---

## Progress Update as of 2026-05-19 21:00 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Redesigned the Current/Proposed tab UI from buttons to file-folder tabs and added fading vertical side-lines that frame the document. Replaced the two separate server-rendered pages with a single client-side `<TabbedDocument>` so users can flip between Current and Proposed instantly without a network round-trip. Both `/` and `/proposed` still exist as bookmarkable URLs; the URL syncs to the active tab via `history.pushState` on click and a `popstate` listener handles back/forward. Tests still 137 passing; tsc clean; smoke: /=200, /proposed=200.

### Detail of changes made:
- **`src/components/TabBar.tsx`** — visual redesign + new optional `onTabChange` prop. Tabs now have `rounded-t-lg` top corners, active tab uses `bg-white border-b-0 -mb-px z-10` so it visually "attaches" to the doc body below (overlapping the horizontal divider). Inactive tab uses `bg-zinc-100` + grayer text. Bottom of the bar is an `h-px bg-zinc-300` divider that the tabs sit on top of. When `onTabChange` is provided (used by `<TabbedDocument>`), tabs render as `<button>`s; without it they fall back to `<Link>`s for plain SSR usage.
- **`src/components/TabbedDocument.tsx`** — new client component. Owns `activeTab` state initialized from `initialTab` prop. `handleTabChange` calls `setActiveTab` + `window.history.pushState(null, '', '/' | '/proposed')` so the URL updates without a navigation. `useEffect` listens for `popstate` to sync state with browser back/forward. Always-mounts both views (`<HomepageArticles mode="static">` and the interactive variant with `<ArticleSelectionContainer>`, working-draft banner, `<EndorseButton>`); inactive view is hidden via the `hidden` Tailwind class so switching is purely a CSS toggle. The `<HighlightPopover>` and `<ProposalDrawer>` are mounted only when proposed tab is active (they listen to global window events, but their triggers — `ArticleSelectionContainer` `mouseup`, `AnchorSentence` `anchor-open` — only fire from the visible interactive view, so always-mounting would also work; conditional mount avoids unnecessary subscriptions on the current tab).
- **`src/lib/homepage/load-tab-data.ts`** — new shared loader. `loadHomepageTabData()` fetches everything both tabs need (currentVersion, proposedVersion, baseVersionId, proposalCounts, proposalsByAnchor, acceptedProposals, isAdmin, initialEndorsed, endorserCount) inside one try/catch so DB unavailability falls through with defaults. Both pages now call this loader instead of inlining the queries.
- **`src/app/page.tsx`** — slimmed down. Now just calls `loadHomepageTabData()` and renders `<TabbedDocument initialTab="current" {...data} />` inside the existing layout. Removed inline `getCurrentVersion` + `bumpPatch` logic — those live in the loader now. Living-document footer now reads `data.currentVersion` rather than the hardcoded `"0.0.1"`.
- **`src/app/proposed/page.tsx`** — same treatment. Renders `<TabbedDocument initialTab="proposed" {...data} />`. Removed all the inline imports for proposal queries, `auth`, `signers`, `applyEdits`, `buildOriginalTextByAnchor`, `getCurrentAdmin` — all now handled by `loadHomepageTabData` and `<TabbedDocument>`. Footer reads `data.proposedVersion` for "Version X.X.X — working draft".
- **Fading side lines** — implemented as two `absolute inset-y-0 w-px` divs (left and right) inside a `relative` wrapper sibling to the article views. Background is `bg-gradient-to-b from-zinc-300 via-zinc-300/30 to-transparent` so the line is strongest at top, half-strength at midpoint, fully transparent at bottom. `pointer-events-none` so they don't intercept clicks.

### Potential concerns to address:
- Both pages now fetch the full proposal dataset (counts, all proposals by anchor, accepted edits, endorser count) even when serving `/` (which only initially renders the current tab). This is the cost of pre-loading data so client-side tab switching can be instant. For a homepage with low proposal volume this is fine; if proposal counts grow to thousands of pending edits, consider lazy-fetching the proposed-only data when the proposed tab is first activated.
- `<TabbedDocument>` always mounts both `<HomepageArticles>` instances, doubling the rendered HTML for the articles section. The articles array is small (9 short articles), so the size impact is minor (~10KB extra HTML).
- The `popstate` listener only checks `pathname === "/proposed"` — if the routing ever expands beyond `/` and `/proposed` (e.g., `/proposed?focus=anchor-1`), this needs to widen.
- The `<HighlightPopover>` and `<ProposalDrawer>` mount/unmount on tab switch. If the user opens a proposal drawer, switches to current, then switches back to proposed, the drawer will be closed (state reset). This is acceptable for the current UX; if drawer state needs to persist across tab switches, hoist the open state into `<TabbedDocument>`.

---

## Progress Update as of 2026-05-19 18:15 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Implemented Phase 4 partial deliverables: endorsement queries, toggleEndorsement server action, EndorseButton client component, releaseConversionEmail template, /admin/release placeholder page, Release link in admin nav, and EndorseButton on /proposed. 137 tests pass (was 135); TypeScript clean; smoke: /=200, /proposed=200, /admin/release=307.

### Detail of changes made:
- **`src/lib/db/queries.ts`** — added `endorsements` to schema imports. Appended three new endorsement query functions: `getMyEndorsementForVersion` (returns `{id}|null` for a specific signer+version), `countEndorsersForVersion` (integer count), `listEndorsersForVersion` (returns array with signerId + displayName).
- **`src/server/actions/endorsements.ts`** — new file. Pure data-layer `toggleEndorsement(db, {signerId, baseVersionId})` handles insert/delete toggle; if `convertedAt` is set (already promoted to a real signature), returns `"endorsed"` no-op instead of re-deleting. Server action wrapper `toggleEndorsementAction(baseVersionId)` handles Clerk auth, signer lookup, soft-ban check, and revalidates `/proposed`.
- **`tests/server/endorsements.test.ts`** — new file. Two tests for `toggleEndorsement`: inserts on first call → state `"endorsed"`, removes on second call when unconverted → state `"removed"`.
- **`src/components/EndorseButton.tsx`** — new client component. Button toggles endorsement via `toggleEndorsementAction`; if not signed in, fires `open-sign-modal` event to open the existing sign modal. Shows endorser count below the button. Styled with emerald when endorsed, zinc-900 when not.
- **`src/lib/email/templates.ts`** — appended `releaseConversionEmail` template. Used for the future batch email to endorsers when a draft version ships.
- **`src/app/admin/release/page.tsx`** — new admin-gated placeholder page. Shows accepted edit count, pending edit count, endorser count for the current version. Amber callout explains why automated release is deferred (articles[] are source code, not markdown). Release button is disabled with "coming soon" text. Links back to /admin.
- **`src/app/admin/signers/page.tsx`** — added Release link to admin nav.
- **`src/app/admin/selfies/page.tsx`** — added Release link to admin nav.
- **`src/app/proposed/page.tsx`** — added imports for `EndorseButton`, `getMyEndorsementForVersion`, `countEndorsersForVersion`, `auth`, `eq`, `signers`. Fetches `endorserCount` and `myEndorsement` (signer lookup via Clerk userId) inside the existing try/catch. Renders `<EndorseButton>` between the working-draft banner and the TabBar, centered, with `current.id`, `initialEndorsed`, and `endorserCount` props. Dynamic import pattern for db used (`import("@/lib/db")`) to avoid lazy-load issues in the server component.

### Potential concerns to address:
- The `auth()` call in `proposed/page.tsx` uses `.catch(() => ({ userId: null }))` to handle preview/test environments where Clerk is unavailable. This is consistent with the existing `getCurrentAdmin().catch()` pattern on the same page.
- `/admin/page.tsx` still just redirects to `/admin/signers` — the Release link was added to the signers and selfies nav pages instead, since the admin landing page has no UI surface. This is the correct approach given the architecture.
- The endorsement-to-signature conversion email (`releaseConversionEmail`) exists but no send logic is wired — that's intentional per the scope clarifier (deferred to when the release flow is built).

---

## Progress Update as of 2026-05-19 21:15 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Implemented all of Phase 3 (tasks 3.1–3.8): proposed-edit queries, server actions, applyEdits utility, SuggestChangesComposer, ProposalCard, ProposalDrawer, AnchorSentence mode discriminator, updated HomepageArticles with edit overlay rendering, rewired /proposed to use ProposalDrawer, and added /admin/proposals review queue. 135 tests pass (was 120); TypeScript clean; smoke tests 200/200/307.

### Detail of changes made:
- **`src/lib/db/queries.ts`** — added `ProposalRow` interface and four new query functions: `countProposalsByAnchor` (returns `{pending, accepted}` per anchor), `listProposalsByAnchor` (proposals for a specific anchor, pending+accepted, ASC), `getAcceptedProposalsForVersion` (accepted-only for the full /proposed render), `listPendingProposalsForVersion` (admin queue). All join upvote counts via a separate query because pglite doesn't support SQL COUNT + GROUP BY easily in Drizzle.
- **`src/server/actions/proposals.ts`** — new file. Pure data-layer functions: `createProposal` (validates kind != delete requires newText), `acceptProposal` (sets accepted + auto-rejects conflicting pending replaces on same anchor; rejects insert_afters when accepting a delete), `rejectProposal`. Server action wrappers: `submitProposalAction` (auth + soft-ban + rate-limit 10/hr), `acceptProposalAction` (admin-gated), `rejectProposalAction` (admin-gated), `toggleProposalUpvoteAction` (auth + soft-ban).
- **`src/lib/proposed/apply-edits.ts`** — new file. `applyEdits(ProposalRow[]) -> EditsByAnchor`. Per-anchor map with `replaceWith`, `isDeleted`, `insertsAfter[]`. Skips non-accepted proposals. Inserts get synthetic ids `${anchorId}-ins-${editId.slice(0,8)}`.
- **`src/components/AnchorSentence.tsx`** — added `mode: "comments" | "proposals"` prop (defaults to `"comments"`). Badge now dispatches `anchor-open` event with `{ mode, anchorId }` instead of `anchor-open-comments`. Badge icon/aria-label adapts to mode.
- **`src/components/CommentDrawer.tsx`** — updated to listen for `anchor-open` (not `anchor-open-comments`) and filter on `detail.mode === "comments"`.
- **`src/components/SuggestChangesComposer.tsx`** — new file. Radio kind selector (replace/insert_after/delete), proposed-text textarea (hidden for delete), rationale textarea (optional). Anonymous → sessionStorage draft + open-sign-modal. Submits via `submitProposalAction`.
- **`src/components/ProposalCard.tsx`** — new file. Renders kind badge, status badge, diff view (red strikethrough for replaced original, green for replacement, blue for insert), rationale, upvote count, Accept/Reject buttons (admin only, pending only).
- **`src/components/ProposalDrawer.tsx`** — new file. Right-panel drawer, listens for `anchor-open` with `mode="proposals"` and `compose-suggest`. Shows original text header, lists ProposalCards, has footer with SuggestChangesComposer toggle.
- **`src/app/HomepageArticles.tsx`** — added `anchorMode`, `editsByAnchor`, `proposalCounts` props. Interactive mode now applies per-anchor overrides: isDeleted → dim strikethrough span; replaceWith → green left border + replacement text; insertsAfter → additional AnchorSentence elements with blue border; pending proposals → amber underline + count badge.
- **`src/app/proposed/page.tsx`** — full rewrite. Fetches `countProposalsByAnchor`, `listProposalsByAnchor` (for all anchors with proposals), `getAcceptedProposalsForVersion`. Builds `originalTextByAnchor` from `articles[]` using the same `splitSentences()` regex. Computes `editsByAnchor` via `applyEdits`. Renders `ProposalDrawer` (not CommentDrawer) and `HighlightPopover` with `enableSuggestChanges={true}`.
- **`src/app/admin/proposals/page.tsx`** — new file. Admin-gated list of pending proposals for the current version with inline Accept/Reject form buttons. Shows kind, anchor, author, timestamp, newText diff, rationale, upvote count.

### Potential concerns to address:
- `originalTextByAnchor` on /proposed is computed server-side from `articles[]` using `splitSentences()` — must stay in sync with the same function in HomepageArticles.tsx. Currently duplicated; could be extracted to a shared utility if articles change frequently.
- `countProposalsByAnchor` and `listProposalsByAnchor` are still called with `undefined as any` for the db arg (matching the established lazy-load pattern). This is consistent with existing comment queries.
- ProposalDrawer upvote counts are SSR-fetched — the count displayed in ProposalCard doesn't update optimistically after a client-side upvote (just calls `router.refresh()`). Acceptable for now; could be enhanced with optimistic state later.
- CommentDrawer is now unused by any page (/ is static; /proposed uses ProposalDrawer). The component is left intact per the task spec — no deletion.

---

## Progress Update as of 2026-05-19 18:00 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Restructured the homepage into Current (/) and Proposed (/proposed) tabs. Current tab is a clean, read-only article-card view matching the pre-Phase-2 production layout. Proposed tab is the same layout but wraps each sentence in AnchorSentence for per-sentence commenting, plus HighlightPopover and CommentDrawer.

### Detail of changes made:
- Created `src/app/HomepageArticles.tsx`: shared server component rendering the 9-article list. Accepts `mode="static" | "interactive"`. In static mode renders plain `<p>` body text. In interactive mode, splits each article body into sentences via `splitSentences()` (regex on `.!?` followed by capital) and wraps each in `<AnchorSentence anchorId="article-NN-s-I" count={...}>`. Contains the canonical `articles` array, `PILL_COLORS`, and `pillColor()` helper copied verbatim from the pre-Task-2.12 page.tsx.
- Created `src/app/ArticleSelectionContainer.tsx`: client component that attaches a `mouseup` listener to its container div. On selection, walks up the DOM to find the nearest `data-anchor-id` element and dispatches a `selection-in-anchor` CustomEvent with `{ anchorId, selectedText, rect }`. This replaces the equivalent logic that was embedded in InteractiveDoc.
- Created `src/components/TabBar.tsx`: renders two tab pills linking to `/` and `/proposed`, with the active tab styled dark. Accepts `active`, `currentVersion`, `proposedVersion` props.
- Rewrote `src/app/page.tsx`: removed DocumentRenderer, CommentDrawer, HighlightPopover, and all comment-fetch logic. Now fetches only `getCurrentVersion()` to derive `currentVersion` and `proposedVersion` (via `bumpPatch()`). Renders `<TabBar active="current" ...>` then `<HomepageArticles mode="static" />`. Hero, FloatingSignButton, signature count, and bottom CTA section are all preserved from production.
- Created `src/app/proposed/page.tsx`: mirrors page.tsx but with `<TabBar active="proposed">`, `<ArticleSelectionContainer>` wrapping `<HomepageArticles mode="interactive" anchorCounts={...}>`, plus `<HighlightPopover enableSuggestChanges={false} />` and `<CommentDrawer>`. Includes a "Working draft · vX.X.X · Hover any sentence to comment" banner between signature count and TabBar.
- DocumentRenderer and InteractiveDoc are unchanged — still used by `/v/[version]` archive views.
- Design judgment: placed TabBar above the article list inside the same `<section>` as the signature count and "Join" heading; added a slim "Working draft" subtitle on /proposed only; kept FloatingSignButton on /proposed (signing applies to current, not draft, but the button doesn't interfere).

### Potential concerns to address:
- `splitSentences()` is a naive regex splitter. It handles the 9 curated article bodies well (tested visually), but could misfire on future articles with abbreviations (e.g., "Dr. Smith" would split). A smarter splitter can be swapped in later without changing the API.
- `anchorCounts` on /proposed only reflects comments on the current version's anchors (`baseVersionId = current.id`). When v0.0.2 is promoted to current, old anchor IDs will still match because the `article-NN-s-I` scheme is derived from position, not DB content. This is acceptable for Phase 2.
- `countCommentsByAnchor` and `listCommentsForAnchor` are still called with `undefined as any` for the `db` arg (matching the previous pattern in the old page.tsx) to use the default lazy-loaded DB. This is fine but slightly inelegant.

---

## Progress Update as of 2026-05-19 17:45 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Fixed two visual bugs on the homepage that surfaced after Phase 2 wired in the comment UI: (1) invisible anchor-sentence comment buttons were still consuming inline width, creating gaps between sentences; (2) prose typography (h1/h2/p sizing, line-height, spacing) was not rendering because `@tailwindcss/typography` was not installed or registered.

### Detail of changes made:
- Modified `src/components/AnchorSentence.tsx`:
  - Changed the comment badge button classes from `opacity-0 transition group-hover:opacity-100 inline-flex` to `hidden group-hover:inline-flex`. This removes the button from layout entirely when not hovered (display:none rather than invisible), eliminating the ~24px gaps that accumulated across 5+ sentences in a paragraph.
- Installed `@tailwindcss/typography` (v0.5.19) as a dev dependency via `pnpm add -D @tailwindcss/typography`.
- Modified `src/app/globals.css`: added `@plugin "@tailwindcss/typography";` on the second line, after `@import "tailwindcss";`. This is the Tailwind 4 way to register plugins (no tailwind.config.ts exists in this project — it uses the CSS-first config approach via `@tailwindcss/postcss`).
- The `<article className="prose prose-zinc max-w-none">` in `src/components/InteractiveDoc.tsx` was already correct; the missing plugin was the sole reason headings rendered unstyled.

### Potential concerns to address:
- `prose prose-zinc` applies default prose sizing. The document's `<h1>` (preamble "An AI Bill of Rights") will now render with Tailwind typography defaults (~2.25rem / 36px). This may be smaller than the hero h1 above it; if the designer wants a custom prose-xl or overridden heading size, that's a follow-on task.
- `@tailwindcss/typography` 0.5.x is the CSS-plugin version; Tailwind 4 compatibility is confirmed by the `@plugin` directive support in v4 `@tailwindcss/postcss`.

---

## Progress Update as of 2026-05-19 16:45 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Task 2.13 complete. Added `hideCommentAction` and `unhideCommentAction` server actions to `src/server/actions/comments.ts`, and created `src/app/admin/comments/page.tsx` — a server-rendered admin moderation page that lists the 100 most recent comments with per-row Hide/Unhide form buttons. Admin gate uses `getCurrentAdmin()` with strict `ctx.state === "admin"` check.

### Detail of changes made:
- Modified `src/server/actions/comments.ts`:
  - Added `import { getCurrentAdmin } from "@/lib/admin/check"` at the top (previously missing from this file).
  - Appended `hideCommentAction(commentId, reason?)`: checks `ctx.state === "admin"`, updates `comments.hiddenAt` and `comments.hiddenReason`, revalidates `/` and `/admin/comments`.
  - Appended `unhideCommentAction(commentId)`: same admin gate, sets both fields to `null`.
  - Both use the lazy `getDb()` pattern already established in the file.
- Created `src/app/admin/comments/page.tsx`:
  - `export const dynamic = "force-dynamic"` to prevent caching.
  - Two inline server actions (`handleHide`, `handleUnhide`) that delegate to the new action functions.
  - Fetches top 100 comments via drizzle `innerJoin` with `signers` to get `displayName`; orders by `desc(comments.createdAt)`.
  - Each list item shows author, anchor/proposal label, timestamp, body text, and a single toggle button (Hide/Unhide) via a `<form action={...}>` with a hidden `commentId` input.
  - Hidden comments shown with `bg-zinc-50` background; visible with `bg-white`.
  - Admin gate: if `ctx.state !== "admin"`, calls `notFound()`.

### Potential concerns to address:
- No pagination yet — hard-capped at 100 rows. Acceptable for now.
- The `notFound()` guard only handles the strict "admin" state. States like "no-admins-yet" or "bootstrap" are treated the same as unauthenticated (404). This matches the self-review spec requirement.

---

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
