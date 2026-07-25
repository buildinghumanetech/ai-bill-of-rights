# Branch Progress: sparkle/agent-3c63cf44-ec48-4ca6-989f-c9b2e569c3fa

## Progress Update as of [2026-07-24 21:30 Pacific]
*(Most recent updates at top)*

### Summary of changes since last update

Fixes two real defects roborev found in the selection code shipped in PR #32
(already merged), plus three smaller cleanups it flagged. Both defects were in
the touch-selection path — i.e. in the mobile experience the previous commit
claimed to fix — so they were worth a same-day follow-up rather than a backlog
entry.

### Detail of changes made:

- **Sticky dedupe guard (the important one).** `lastEmitted` was only reset when
  `emitCurrentSelection` observed a *collapsed* selection. The two early returns
  for a non-collapsed selection (no anchor found, node outside root) left a
  stale value behind, and the 350 ms debounce frequently swallows the collapsed
  intermediate state entirely. Net effect: select a phrase → composer opens →
  **Cancel** → re-select the same phrase → nothing happens, and the user has to
  pick different text to recover. Fixed structurally rather than by patching
  each return: `nextSelectionState(last, observed)` in
  `src/lib/comments/selection.ts` is now the single place the guard advances,
  `observed` is `null` for every unusable case, and that case resets `last`.
  Reading the selection is now a separate `observeSelection()` that returns
  `AnchoredSelection | null`, so there is no early-return path that can skip the
  reducer. Belt and braces on top: `mousedown` / `touchstart` clear the guard
  (a new gesture makes the last emit history), and `<CommentsColumn>` dispatches
  `selection-composer-closed` (exported as `COMPOSER_CLOSED_EVENT`) on cancel or
  submit, which handles the cancel case regardless of debounce timing.
- **Mid-gesture scroll yank.** The mobile `scrollIntoView` ran on *every*
  emitted selection. On iOS the normal flow is long-press then drag the
  selection handles; each adjustment settles the debounce with different text,
  passes the dedupe, and re-emits — so the page scrolled the column to center
  repeatedly, pulling the text out from under the finger still dragging it (and
  remounting the composer, discarding typed text). Now gated on a
  `composerOpenRef` closed→open transition, so it fires once per gesture.
- **Breakpoint magic number removed.** The scroll was gated on
  `matchMedia("(max-width: 767px)")`, duplicating Tailwind's `md` from a grid
  definition that can change independently. Replaced with the condition we
  actually care about: scroll when the column's `getBoundingClientRect().top`
  would put the composer off-screen. This is layout-truth, works at any
  viewport, and cannot drift.
- **`FeedbackInvite` props are now a discriminated union.** The `proposed`
  variant required `currentVersion` and `onOpenDraft` and used neither, forcing
  callers to pass meaningless values. Also collapsed the two side-by-side
  buttons in the `current` variant — both called the identical `onOpenDraft`, so
  assistive tech announced two distinct controls that weren't. The count is now
  supporting copy under a single button.
- **Dead code removed.** `commentCount` on `<TabBar>` is required (both call
  sites pass it) so the `undefined` branches are gone, and the unused
  `data-comments-column` attribute was dropped.

### Testing

- `tests/lib/comments.selection.test.ts` rewritten against the reducer: 9 tests,
  including an explicit regression guard for the sticky-guard bug and a full
  select → dedupe → cancel → reselect round trip.
- Suite **202 passing / 38 files**; `tsc --noEmit` clean; `eslint src`
  unchanged from baseline (114 pre-existing problems).
- Re-verified live in Chrome against `next dev`: touch-path emit, duplicate
  suppression, re-emit after `selection-composer-closed`, and re-emit after
  `mousedown` all confirmed.

### Potential concerns to address:

- **`SELECTION_SETTLE_MS = 350` still hasn't been measured on a real iOS
  device** — only desktop Chrome. This is the one remaining item where real
  hardware could change the answer.
- The `<Link>` (no-`onTabChange`) branch in `TabBar` is now unreachable, but it
  predates this branch and is a reasonable SSR fallback API, so it was left
  alone rather than widening scope.
- Local preview still requires Clerk + Neon credentials; see the note in the
  previous entry.

---

## Progress Update as of [2026-07-24 20:45 Pacific]

### Summary of changes since last update

First entry on this branch. Addresses user feedback that readers could not tell
the AI Bill of Rights accepts feedback at all — people were reading it as a
finished take-it-or-leave-it document whose only options were "agree" or
"disagree". The feedback mechanism (highlight text on the Proposed tab → a
composer opens in the right column) existed but was announced by exactly one
grey sentence inside a column most readers never looked at, and it was
*impossible* to use on a phone. This adds explicit invitations at every point a
reader forms their impression, and makes touch selection work.

### Detail of changes made:

- **`src/components/FeedbackInvite.tsx` (new).** The "you can change this"
  banner rendered directly above the document tabs, in two variants driven by a
  `variant` prop:
  - `current` — states that v(current) is what people sign and v(proposed) is
    the open draft, that comments are public and voted on, and that the winning
    ones get folded into the next version. Ends with the explicit line
    "Disagreeing with a line is a reason to say so here — not a reason to walk
    away," which is the exact misconception in the reported feedback. Has a
    primary button plus a secondary link, both calling `onOpenDraft`.
  - `proposed` — a numbered 3-step strip (Select any text → Say what you'd
    change → Add your email to post). The steps name the *physical gesture*
    ("drag across a sentence — on a phone, press and hold"), which is the part
    nobody was guessing.
- **`src/lib/comments/count.ts` (new).** `countComments` recurses the
  `ThreadedComment` tree counting replies as well as roots, plus
  `commentCountLabel` for singular/plural. Extracted rather than inlined so the
  count can be shown in three places (tab sub-label, invite, column header)
  without re-deriving it, and so it is unit-testable in the `node` vitest env.
- **`src/lib/comments/selection.ts` (new).** `shouldEmitSelection(last, next)` —
  the dedupe predicate for the two-signal selection listener (see below). Pure,
  so it is tested without a DOM.
- **`src/app/ArticleSelectionContainer.tsx`.** Previously listened *only* for
  `mouseup`, which never fires for a touch long-press — meaning commenting was
  flatly impossible on a phone, on a document whose whole point is broad public
  input. Now also listens to a debounced `document` `selectionchange`
  (`SELECTION_SETTLE_MS = 350`), which is the only signal touch selection emits.
  Both signals fire for one desktop gesture, so `shouldEmitSelection` suppresses
  the duplicate — without it the second signal would remount `NewCommentForm`
  and silently discard whatever the user had already typed. Also added a
  `root.contains(node)` guard so selecting text inside the composer itself
  doesn't re-trigger, and `lastEmitted` resets on a collapsed selection so the
  same phrase can be re-selected later.
- **`src/components/CommentsColumn.tsx`.** Replaced the single grey sentence
  ("Highlight any text to comment or suggest changes.") with a dashed-border
  idle card that names the gesture, says what to write, and explains that the
  cyan highlights in the text are other people's threads you can click. Header
  now shows a live count. Also: on viewports below `md` the column is stacked
  underneath the entire document, so a phone user who highlighted text saw
  nothing happen — it now `scrollIntoView`s itself on selection (guarded by
  `matchMedia("(max-width: 767px)")` so desktop is unaffected).
- **`src/components/TabBar.tsx`.** Tabs gained an optional `subLabel`. Proposed
  reads "N comments — add yours" (or "Comment on this draft" when empty),
  Current reads "Sign this version". Previously the two tabs looked like two
  static documents with no hint that one of them was writable. Sub-labels only
  render when `commentCount` is passed, so the SSR `<Link>` usage is unchanged.
  Tab padding is now `px-4 sm:px-10` — the fixed `px-10` plus a sub-label
  overflowed narrow phones.
- **`src/components/TabbedDocument.tsx`.** Computes `commentCount` once from
  `threadedComments` and feeds it to both invites and both tab bars. `openDraft`
  switches to the Proposed tab and scrolls `proposedTopRef` into view — without
  the scroll the tab swap happens far below the fold and looks like nothing
  happened. Note `openDraft` is a plain function, not `useCallback`: it closes
  over `handleTabChange`, and wrapping it tripped `react-hooks/exhaustive-deps`
  for no benefit since `FeedbackInvite` is not memoized.
- **`src/app/page.tsx` / `src/app/proposed/page.tsx`.** Added a sub-headline
  under the hero and a paragraph + button in the closing section. The closing
  section previously ended on "Companies that won't agree to them are telling
  you who they are" — a hard full stop that reinforced the take-it-or-leave-it
  read. It now continues into "Not the whole way there for you? That's what the
  draft is for."

### Testing

- `tests/lib/comments.count.test.ts` (7 tests) — nesting depth, multiple roots,
  singular/plural.
- `tests/lib/comments.selection.test.ts` (6 tests) — first emit, empty/whitespace
  rejection, the duplicate-signal suppression, text change within an anchor,
  same text in a different anchor, re-emit after clearing.
- Full suite: **199 passed / 38 files**. `tsc --noEmit` clean. `eslint src` is
  byte-identical to the pre-change baseline (114 problems, all pre-existing —
  verified by stashing and re-running).
- Behavior verified in a real browser against `next dev`, not just unit tests:
  confirmed the touch path (a selection appearing with **no** mouseup) emits,
  the duplicate signal does **not** re-emit, and a new anchor does emit.

### Potential concerns to address:

- **The dev server cannot serve real routes locally without Clerk + Neon
  credentials.** `clerkMiddleware` redirects every route to a Clerk handshake
  URL, so browser verification had to be done against HTML captured via `curl`
  and dropped in `public/` (removed afterwards; `.env.local` also removed). Any
  future session doing visual work will hit this — worth a documented
  "local preview without credentials" path.
- **`countComments` walks the whole tree on every render of `TabbedDocument`.**
  Fine at current volume; if comment counts reach the thousands, memoize it.
- **The mobile `scrollIntoView` uses a hardcoded 767px breakpoint** that must
  stay in sync with Tailwind's `md`. If the grid breakpoint in `TabbedDocument`
  changes, this must change with it.
- **`SELECTION_SETTLE_MS = 350` is a guess** tuned to feel instant while
  outlasting a drag. It was validated on desktop Chrome only — real iOS Safari
  long-press timing has not been measured on a device.
- Pre-existing and untouched: `TabbedDocument` and `CommentsColumn` both trip
  `react-hooks/set-state-in-effect`, and `_comments` is still an unused prop
  threaded through from `loadHomepageTabData`.

---
