# Branch Progress: sparkle/agent-3c63cf44-ec48-4ca6-989f-c9b2e569c3fa

## Progress Update as of [2026-07-25 09:30 Pacific]
*(Most recent updates at top)*

### Summary of changes since last update

Round 8 (roborev job 50, on merged commit 167884d): **0 Mediums, 3 Lows**, all
taken. Behaviour-preserving throughout — a misleading name, a duplicated
expression, and three copies of one explanation. **This is the last change on
this branch;** see the stop rationale below.

### Detail of changes made:

- **`fitsInViewport` → `isShorterThanViewport`.** The old name asked a question
  about *position* while the function only compared *size*. A composer parked
  400px below the fold "fits in the viewport" by that predicate — which is
  exactly the geometry of the discriminating alignment test added last round. No
  caller was wrong (both want the size question), but a reader debugging the
  visibility rule could plausibly read `fitsInViewport(input)` at the clamp site
  as "already showing" and invert it. The doc now opens by saying it is a size
  question and says nothing about being on screen.
- **Extracted `composerHeight`.** Last round's whole point was that
  `bottom - top` compared against `viewportHeight` must not be written twice. It
  extracted the *comparison* and left the *subtraction* duplicated one expression
  down — and the subtraction is the likelier edit, because a keyboard inset gets
  applied to the rect, not to `viewportHeight`. If the two derivations diverged,
  `showable` could pick `viewportHeight` for a composer that fits (or `height`
  for one that doesn't) while the degenerate guard checked only the first.
  `bottom - top` now appears exactly once in the file (verified by grep).
- **Consolidated the tall-composer explanation.** It was told three times in
  three adjacent doc comments from three angles, and `MIN_VISIBLE_FRACTION` still
  described a `min(...)` shape the code no longer literally uses.
  `isShorterThanViewport` is now the canonical account; the other two defer to it
  with `{@link}`. Rounds 6, 7 and 8 each flagged comment drift in this one block —
  the fix for that is fewer copies, not a fourth simultaneous rewrite.

### Verification actually run (not assumed):

- `tsc --noEmit` clean. `eslint src` → 114 problems, unchanged baseline.
- Full suite: **327 tests, all passing** — unchanged count, which is what a
  behaviour-preserving refactor should look like.

### Stop rationale — read this before starting a ninth round:

Eight rounds ran on this feature. Rounds 1-3 each found a real correctness bug in
untested wiring; round 4 added the component-test layer whose absence caused
them. **Rounds 5-8 found zero correctness bugs in the feature** — every finding
was in the scaffolding, and rounds 5, 6 and 7 each found a defect created by the
previous round's fix. Round 8's findings are the first that strictly *reduce*
surface (one fewer duplicated expression, two fewer copies of a comment, a name
that stops lying), which is why they were taken after the decision to stop.

Continuing past this point generates more surface than it removes. The
outstanding risk is not reviewable in this repo:

- **`SELECTION_SETTLE_MS = 350` and `MIN_VISIBLE_FRACTION = 0.5` have never run
  on real phone hardware** — fifth entry running. jsdom cannot reproduce iOS
  selection-handle timing or the Android keyboard's effect on `innerHeight`.
- Note the keyboard inset is precisely the drift the last two rounds were spent
  guarding against. The guard is real; the threat model behind it is inference.
  A single long-press on a phone would validate more than a ninth round.

---

## Progress Update as of [2026-07-25 09:15 Pacific]
*(Most recent updates at top)*

### Summary of changes since last update

Round 7 (roborev job 44, on merged commit 005fcba): **0 Mediums, 3 Lows**, all
taken. Nothing wrong with the feature. The notable thing is the *pattern*: for
the third round running, the finding was a non-discriminating test assertion —
each time in the code I had just written to fix the previous round's
non-discriminating test assertion.

### The pattern, stated plainly (read this before writing another test here):

- Round 5: the composer-vs-column geometry test didn't discriminate — the mock
  gave the column's rect to the wrapper too.
- Round 6: the *fix* for that keyed column-vs-wrapper on `querySelector("h3")`,
  which a routine `h3` → `h2` a11y change would silently disarm.
- Round 7: `composerScrollBlock`, added in round 6 to fix round 6's bug, has
  alignment tests that don't discriminate composer geometry from column
  geometry either.

Each round the instance was fixed and the *class* was reintroduced one function
over. The feature has been clean since round 4; the recurring defect is writing
an assertion that passes for the right reason today without checking it would
fail for the wrong one. **The test to apply: name the plausible wrong
implementation, and confirm the assertion fails against it.** Not "does this
pass", but "what would still pass that shouldn't".

### Detail of changes made:

- **One `fitsInViewport` predicate now feeds both rules.** "Does the composer fit
  on screen?" was written twice in two shapes — `Math.min(height,
  viewportHeight)` as a clamp in `shouldScrollComposerIntoView`, and `height >
  viewportHeight` as a branch in `composerScrollBlock`. They *have* to agree: the
  clamp is what makes a tall composer's visible ratio saturate at 1, and
  `"start"` alignment is what makes that saturated state a usable resting
  position rather than a stuck one. The realistic drift is someone adding an
  Android keyboard inset to `viewportHeight` at one site only — which restores
  exactly the stuck-at-the-bottom bug PR #45 fixed, **with both test suites still
  green**, because each function's tests pin its own half in isolation. That
  hazard is now spelled out in the predicate's doc comment.
- **Added the discriminating alignment test.** The column is only COLUMN_LEAD
  taller than the composer, so for most heights both fit or both overflow and
  pointing `composerScrollBlock` at the column would go unnoticed. The new case
  sits in the 50px band where they disagree: composer 780 fits in 800 →
  `"center"`, column 830 doesn't → `"start"`. Verified red by rewiring the
  alignment call to `el.parentElement.getBoundingClientRect()` — 1 failure, and
  it is the only test that catches it.
- **Corrected a doc comment that was actively misleading.** `placeComposerAt`'s
  new note claimed `height` was passed through "because the scroll-alignment
  choice reads it". It doesn't: `composerScrollBlock` computes `bottom - top`,
  and `ScrollDecisionInput.composerRect` doesn't declare a `height` field at all.
  A reader trusting that comment could have "simplified" the fake rect by
  dropping `bottom` and keeping `height`, silently breaking every geometry test.
  Now says what is true — the argument sets `bottom`, `bottom - top` is the only
  thing measured, and the `height` key exists for DOMRect faithfulness and is
  read by nothing.

### Verification actually run (not assumed):

- Mutation: alignment decided from the column's rect → 1 failure, the new test.
- `tsc --noEmit` clean. `eslint src` → 114 problems, unchanged baseline.
- Full suite: **327 tests, all passing.**

### Potential concerns to address:

- **Seven review rounds is enough.** Rounds 5-7 found zero correctness bugs in
  the feature and three defects in its test scaffolding, each one created by the
  previous round's fix. That is a loop with diminishing returns, and continuing
  it mostly generates more surface to get wrong. Stop here unless the behaviour
  changes.
- **Still unvalidated on hardware, now for the fourth entry running:**
  `SELECTION_SETTLE_MS = 350` and `MIN_VISIBLE_FRACTION = 0.5`. jsdom cannot
  reproduce iOS selection-handle timing or the Android keyboard's effect on
  `innerHeight` — and note that the keyboard inset is precisely the drift hazard
  `fitsInViewport` was extracted to contain. A human with a phone would settle
  more than another round of review.

---

## Progress Update as of [2026-07-25 09:15 Pacific]
*(Most recent updates at top)*

### Summary of changes since last update

Round 6 (roborev job 39, on the merged commit 737e11e): **0 Mediums, 3 Lows**,
all taken. One is a genuine usability bug that PR #42 *introduced* — the clamp
traded an infinite re-scroll for a stuck resting position — so this is a
follow-up on landed code, not polish. Also merged `origin/main` (23 commits
behind; another agent's mention/URL-parsing work) cleanly, no conflicts.

### Detail of changes made:

- **`block: "center"` strands the top of a tall composer.** Centering an element
  taller than the viewport puts its *middle* on screen, so the quote block and
  the top of the `MentionTextarea` (`NewCommentForm.tsx` renders quote first,
  then the textarea) sit above the fold. `shouldScrollComposerIntoView` then
  measures `visible = viewportHeight` → ratio 1 → declines, so nothing ever
  corrects it: the user is parked at the bottom of a box they must type into the
  top of, with no recovery but scrolling by hand.
  **This resting state only became reachable because of the clamp in #42** —
  before it, the ratio could never reach 0.5 and it would have kept re-scrolling
  (the bug #42 fixed). Net: that PR traded an infinite loop for a stuck position.
  New `composerScrollBlock({composerRect, viewportHeight})` in
  `src/lib/comments/selection.ts` returns `"start"` when the composer is taller
  than the viewport, `"center"` otherwise. Kept as a separate pure function so
  the alignment choice is testable without a DOM, same as the visibility rule.
- **The round-5 test hook was itself fragile.** `placeComposerAt` told column
  from wrapper by `el.querySelector("h3")`, coupling *both* geometry guards to a
  heading level in unrelated markup. An `h3` → `h2` a11y fix would have made the
  column report `composerRect`, so the discriminating geometry test would stop
  discriminating and `expect(...querySelector("h3")).toBeNull()` would pass
  trivially — both green while measuring nothing. That is the exact failure mode
  round 5 had just corrected, reintroduced one layer down.
  Now: `data-testid="comments-column"` on the outer div is the hook, and the
  structural assertion is an identity check (`scrolled[0] === composer.parentElement`)
  rather than the absence of a tag. Verified by mutating the heading to `<h2>`
  *and* moving the ref back to the column — both guards still fail.
- **Trimmed 41 lines of doc comment down to what a reader needs at the call
  site.** It had accumulated the full history of the superseded anchor gate and
  the smooth-scroll-vs-debounce timing note, all of which is reproduced verbatim
  in this log and in the commit messages. Kept the rule, the clamp rationale, and
  the measure-the-composer line; the archaeology now lives here only. This also
  makes the block cheaper to keep true — round 5's finding was precisely that
  this comment had drifted out of sync with its own code.

### Verification actually run (not assumed):

- **Guards proven red by mutation.** (A) force `"center"` unconditionally → 2
  failures (the pure test and the component test). (B) heading `h3` → `h2` **and**
  ref moved to the column → 2 failures; under the old tag-keyed mock this
  combination passed silently, which is the whole point.
- `tsc --noEmit` → clean. `eslint src` → 114 problems, unchanged baseline.
- Full suite: **40 files, 238 tests, all passing.**

### Potential concerns to address:

- **`composerScrollBlock` uses a strict `>` against `viewportHeight`.** A
  composer exactly the viewport's height centers, which is correct but means the
  boundary behaviour flips on a single pixel. Both sides are pinned by tests
  (`box(VH)` → center, `box(VH + 1)` → start) so a change is at least visible,
  but nobody has looked at what a real 1-pixel-over composer does on hardware.
- **Six review rounds, and the last two found no correctness bug in the feature
  itself** — round 5 found my tests asserted less than claimed, round 6 found a
  bug my own fix introduced plus a fragile hook. The signal is that the mobile
  selection path has settled and the remaining risk has moved into the test
  scaffolding. Worth stopping the review loop here unless something changes.
- **Still unvalidated on hardware:** `SELECTION_SETTLE_MS = 350` and
  `MIN_VISIBLE_FRACTION = 0.5`, carried forward from the two previous entries.
  jsdom cannot reproduce iOS selection-handle timing or the Android keyboard's
  effect on `innerHeight`. This needs a human with a phone.

---

## Progress Update as of [2026-07-25 08:45 Pacific]
*(Most recent updates at top)*

### Summary of changes since last update

Round 4 of roborev on the mobile selection path came back with **0 Mediums and
7 Lows** — the first round that found no correctness bug. All seven were taken
anyway. The substantive one is a division-by-own-height that could never reach
its threshold on a composer taller than 2x the viewport; the rest sharpen the
component tests so they pin the behaviour they claim to. No production behaviour
changes for any viewport that isn't extremely short.

### Detail of changes made:

- **Clamped the denominator in `shouldScrollComposerIntoView`**
  (`src/lib/comments/selection.ts`). The rule is "scroll unless at least half the
  composer is on screen", measured as `visible / height`. When the composer is
  taller than *twice* the viewport, `visible` maxes out at `viewportHeight` and
  the ratio can never reach 0.5 — so every single emit re-scrolled, forever.
  Now the denominator is `Math.min(height, viewportHeight)`, i.e. "half of what
  could possibly be shown". This is reachable in practice: a landscape phone, or
  Android where the on-screen keyboard shrinks `innerHeight` beneath an expanded
  textarea. Two tests pin both directions — a viewport-filling composer that
  fills the screen holds still, one that is genuinely off-screen still scrolls.
- **Made the doc comment on that function honest about two things** it had been
  quietly glossing: the rule applies at *every* width (it began as a mobile
  affordance, but "you can't see the box you're about to type into" is worth
  fixing on a short desktop window, and keying it to visibility rather than a
  breakpoint is what stops it drifting out of sync with the grid); and smooth
  scroll runs ~300-600ms, which **outlasts the 350ms selection debounce**, so a
  second emit mid-animation can genuinely re-issue the scroll. That is benign —
  same element, same `block: "center"`, so the animation continues toward the
  same place rather than jumping — but it was worth stating rather than implying
  the visibility check makes re-issues impossible.
- **Rewrote `tests/components/comments-column.test.tsx`** (now 12 tests). Two
  structural changes make previously-unfalsifiable claims testable:
  - `COLUMN_LEAD = 50` — `placeComposerAt(top)` now gives *ancestor* elements a
    rect starting 50px higher than the composer's, mirroring the real layout
    (heading + padding). Without this the column and composer had identical
    boxes, so "measure the composer, not the column" was not a claim any test
    could distinguish.
  - The `scrollIntoView` mock captures `this` into a `scrolled: Element[]`, so
    tests assert *which element* was scrolled, not merely that something was.
  - The `NewCommentForm` stub now exposes `onCancel` / `onSubmittedNewTopLevel`
    as real buttons, which is what makes the four dismissal tests reachable.
- **Fixed a listener leak in `tests/components/article-selection-container.test.tsx`.**
  Listeners registered on `document` outlived their test and fired during later
  ones, so a single failure could cascade. A module-scope `activeListener` is now
  torn down in `afterEach`. Still 7 tests.
- **Added 2 clamp tests to `tests/lib/comments.selection.test.ts`** (now 17).

### Round 5 (roborev job 37, on commit 3948e77): 0 Mediums, 4 Lows, all taken

Round 5 found that the round-4 test work did **not** do what its own commit
message claimed, and the correction is folded into this same commit:

- **`COLUMN_LEAD` was not actually discriminating anything.** The mock handed the
  lead-adjusted, column-shaped rect to *every* element containing the composer —
  including the `composerRef` wrapper, which is the element the layout effect
  measures. So the geometry assertions were exercising column geometry the whole
  time, exactly what they existed to rule out. The round-4 claim that mutation C
  produced 6 failures was true, but those failures came from the structural
  `querySelector("h3")` check, not from geometry. Fixed properly: only the
  element that *also contains the heading* gets `columnRect`; the wrapper hugs
  the composer and gets `composerRect`, which is what the real DOM does.
- **Added the test that discriminates on geometry alone.** The two rules only
  disagree in a narrow band, so the numbers are load-bearing: at
  `placeComposerAt(VH - 90)` the composer is 90/200 = 0.45 visible (scroll) while
  the column is 140/250 = 0.56 (hold still). Verified in isolation with `-t`
  against the parentElement mutation — it fails on its own.
- **`MIN_VISIBLE_FRACTION`'s comment contradicted its own code.** It still said
  "ratio of the element's own measured height ... so it can't drift", which the
  clamp had made false. Reworded to "however much of it could possibly be shown",
  and the clamp rationale moved up next to the constant instead of living 40
  lines away at the use site.
- **The clamp introduced a second path to a zero denominator.** `viewportHeight
  = 0` makes `Math.min(height, viewportHeight)` zero → `NaN < 0.5` → `false`,
  i.e. "visible enough", the wrong direction. The `height <= 0` guard no longer
  covered it. Now `if (height <= 0 || viewportHeight <= 0) return true`.
- **Listener teardown was a single slot**, so the leak it fixed would return the
  moment any test called `renderArticle()` twice — the second call overwrites the
  reference and the first listener stays on the shared `window`. Now an array
  drained with `splice(0)`. Latent, not live, but a trap worth closing.

### Verification actually run (not assumed):

- **Each guard proven red by mutation.** (A) old off-screen rule → 4 failures;
  (B) unclamped denominator → 2 failures (the 3x case *and* the new mid-band
  case); (C) measure the column instead of the composer → caught by the new
  geometry test **alone**, run in isolation; (D) drop the zero-viewport guard →
  1 failure.
- `tsc --noEmit` → clean. `eslint src` → 114 problems, the exact pre-existing
  baseline (unchanged, not improved — none of these files were contributors).
- Full suite: **40 files, 233 tests, all passing, 42.97s.**

### Potential concerns to address:

- **A full-suite run overlapping another heavy run reports false failures.** One
  run came back `6 failed | 223 passed` with a 7,204s wall time for a suite that
  takes ~39s. Re-running alone: 40/40 files, 229/229 tests green. The cause is
  contention between concurrent `pglite` instances — the DB tests each stand up a
  real Postgres and individually take 1-3s, so they blow the 15s `testTimeout`
  under load. Nothing in the suite is order-dependent; it is purely resource
  starvation. Worth knowing before anyone trusts a red run: **confirm serially
  before believing a DB-test failure.**
- **`SELECTION_SETTLE_MS = 350` and `MIN_VISIBLE_FRACTION = 0.5` remain
  unvalidated on real phone hardware.** Both were tuned against a simulated
  viewport in jsdom, which cannot reproduce iOS selection-handle timing or the
  Android keyboard's effect on `innerHeight`. Carried forward from the previous
  entry and still open — this needs a human with a phone, not another test.

---

## Progress Update as of [2026-07-24 22:00 Pacific]
*(Most recent updates at top)*

### Summary of changes since last update

Closes the last two Medium findings on the mobile scroll path and — more
importantly — **adds the component-test layer whose absence caused this loop**.
Three consecutive roborev rounds each found a real regression in the same few
lines, every one of them in wiring that no test could reach. That is now fixed
at the root: `jsdom` + `@testing-library/react` are in, with 14 component tests,
and each regression guard was verified to actually fail against the specific bug
it describes before being kept.

### Detail of changes made:

- **The off-screen check under-triggered.** `rect.top >= vh || rect.bottom <= 0`
  treats a single visible pixel as "visible", and it measured the *column*,
  whose top sits ~50px above the composer. So selecting a sentence near the
  bottom of the article routinely left the column top at, say, `vh - 40` → no
  scroll → composer entirely below the fold. Worse, the previous commit's
  "keeps a partially visible column put" test had locked that behaviour in.
  Now: a `composerRef` wrapper means the **composer itself** is measured, and
  the rule is "scroll unless at least half of it is on screen", expressed as a
  fraction of the element's own measured height (`MIN_VISIBLE_FRACTION`) rather
  than a pixel constant that can drift.
- **The anchor gate was sticky, and redundant.** `lastScrolledAnchorRef` was
  cleared only in `closeComposer`. Anchors are sentence-level, so re-selecting a
  *different phrase in the same sentence* kept matching the gate: no scroll, the
  composer silently updated off-screen, and it never recovered — the composer
  the user would have to dismiss to reset it being the thing they couldn't see.
  Roborev's sharper observation is that the gate was never needed: the first
  scroll centres the composer, so every later emit in that gesture already sees
  it as visible and declines. **Deleted the gate entirely**; visibility alone
  handles both the iOS handle-drag and the re-selection case correctly.
- **Scroll decision moved into `useLayoutEffect` keyed on `pendingSelection`.**
  It was a `requestAnimationFrame` fired from the event handler, but React
  commits through the scheduler (MessageChannel), so the rAF could run *before*
  the composer was in the DOM — measuring the short idle placeholder instead.
  A layout effect runs against the committed DOM by construction, which is what
  makes measuring the composer meaningful at all.
- **`closeComposer` is now `useCallback`-stable** and listed in its effect's dep
  array (previously a fresh identity each render called from an effect with
  `[activeCommentId]` — safe today, a stale-closure trap on the next edit), and
  the effect is guarded on `pendingSelection` so it no longer dispatches
  `COMPOSER_CLOSED_EVENT` on mount or twice on the submit path.

### Testing — the actual fix for this loop

- **New: `tests/components/`** with `jsdom` + `@testing-library/react`
  (devDependencies; `vitest.config.ts` keeps `environment: "node"` as the
  default and component files opt in with a `// @vitest-environment jsdom`
  docblock, so the existing suite is untouched and stays fast).
  `tests/_helpers/setup-dom.ts` sets `IS_REACT_ACT_ENVIRONMENT`.
- `article-selection-container.test.tsx` (7): touch-style emit with no mouseup,
  single emit when both signals fire, non-anchored selections ignored, and all
  three guard-reset paths (`COMPOSER_CLOSED_EVENT`, `mousedown`, collapse).
- `comments-column.test.tsx` (7): scrolls below the fold, holds when visible,
  scrolls on a sliver, no re-scroll during an open composer's adjustment,
  re-scrolls for a new phrase in the same sentence, announces closure, and
  stays quiet when nothing was open.
- **Each guard was proven red against its own bug** by temporarily reinstating
  the old code: the sliver test fails under the old off-screen rule, the
  same-sentence test fails under the old anchor gate, and the closure test fails
  under the old silent dismissal. A guard that has never failed proves nothing.
- Suite **222 passing / 40 files**; `tsc --noEmit` clean; `eslint src` at the
  exact baseline (114 pre-existing). Live in Chrome: emits fire, re-emit after
  close works, a new sentence emits, no JS errors.

### Potential concerns to address:

- `MIN_VISIBLE_FRACTION = 0.5` is a judgement call, not a measurement — half a
  composer visible is enough to notice, but a real phone check would confirm.
  Together with `SELECTION_SETTLE_MS = 350`, these are the two remaining values
  worth validating on actual hardware; both are now at least covered by tests
  that pin their behaviour so a change is deliberate.
- The component tests stub `NewCommentForm` and `CommentView`, so they cover the
  column's *own* behaviour and not the composer's internals. Submitting a
  comment end-to-end is still only covered at the server-action layer.
- `pnpm install` prints an `ERR_PNPM_IGNORED_BUILDS` warning and wants to write
  an `allowBuilds:` block into `pnpm-workspace.yaml`; that write was reverted
  deliberately since it's placeholder text, not config. Unrelated to this work
  but it will keep appearing.

---

## Progress Update as of [2026-07-24 21:45 Pacific]
*(Most recent updates at top)*

### Summary of changes since last update

Closes two Medium regressions roborev found in the previous commit's fix (PR
#34) — my `justOpened` gate traded the mid-gesture yank for a *different*
mobile failure, and one composer-dismissal path still leaked a stale guard —
plus five cleanups. Both regressions were verified real before fixing (the
keyboard repro depends on the highlights being focusable, which
`HomepageArticles.tsx:373-374` confirms: `role="button"`, `tabIndex={0}`,
Enter/Space handler).

### Detail of changes made:

- **Second mobile selection stopped scrolling.** Gating the scroll on a
  closed→open composer transition meant: highlight P → page scrolls down to the
  composer → user scrolls back up to the article (no reason to cancel, and the
  composer isn't visible from up there) → highlight Q → `justOpened === false` →
  no scroll, composer silently swaps to Q far off-screen. That is the original
  "nothing happens on a phone" bug wearing a different hat. Now gated on
  **selection identity** instead: `shouldScrollComposerIntoView` returns false
  when the anchor matches the last one scrolled to. Dragging an iOS selection
  handle keeps the same `anchorId`, so the yank stays suppressed, while a
  genuinely new sentence scrolls again.
- **The `activeCommentId` dismissal leaked a stale guard.** It cleared
  `pendingSelection` without dispatching `COMPOSER_CLOSED_EVENT` — the exact bug
  class the previous commit set out to kill, via a different exit. Mouse users
  were rescued incidentally (clicking a highlight fires `mousedown` inside the
  article container → `forgetLastEmit`), but keyboard users were not: select P
  with Shift+Arrow → Tab to a highlight → Enter → re-select P → suppressed
  forever. Now routed through `closeComposer()`, so *every* dismissal path
  clears the guard.
- **`composerOpenRef` removed.** It was a hand-maintained mirror of derived
  state updated in three places, and it desynced when `baseVersionId` is null:
  set to `true` on first emit, but no composer renders, so nothing ever set it
  back — killing the mobile auto-scroll for the rest of the session with no
  visible cause. Replaced by `lastScrolledAnchorRef`, which records a fact that
  actually happened rather than mirroring render state.
- **Dropped the `- 120` magic number.** It stood in for the composer's height
  and was measured against the column's top, which over-triggered on desktop:
  on a short viewport the sticky column's top could exceed `innerHeight - 120`
  while article text was still perfectly selectable, smooth-scrolling a layout
  where the composer was already reachable. The condition is now plain
  "is the column outside the viewport" (`top >= vh || bottom <= 0`), with no
  constant.
- **Event names moved to `src/lib/comments/selection.ts`** as `SELECTION_EVENT`
  and `COMPOSER_CLOSED_EVENT`. `CommentsColumn` was importing the entire
  `ArticleSelectionContainer` module to read one string, and `"selection-in-anchor"`
  was a bare literal in two files. The names are a contract *between* the two
  components, not part of either one's API.
- **Dead code removed.** The `rect` field on the selection event was written by
  the container, typed in `CommentsColumn`, and read by nobody — the re-read
  `getSelection()` and `?? 0` fallbacks existed only to fabricate a value for it.
  Event detail is now just `AnchoredSelection`. Also deleted the
  `shouldEmitSelection` wrapper, which after the reducer refactor was referenced
  only by its own test.

### Testing

- `shouldScrollComposerIntoView` is a pure function with 7 tests covering the
  same-anchor drag case, the new-sentence case (an explicit regression guard for
  the bug above), already-visible, scrolled-off-the-top, and the exact bottom
  edge. Extracting the *decision* keeps it testable in the repo's existing
  node-only vitest setup — no jsdom/testing-library dependency added.
- Suite **208 passing / 38 files**; `tsc --noEmit` clean; `eslint src` back to
  the exact baseline (114 problems, all pre-existing — an earlier revision of
  this commit added a stray unused-disable warning, since removed).
- Live in Chrome: emit still fires, re-emit after `COMPOSER_CLOSED_EVENT` works,
  a new sentence emits, and the event detail now carries only
  `["anchorId","selectedText"]`. The "column already visible → don't scroll"
  branch was confirmed against a real measured rect (top 337, vh 862).

### Potential concerns to address:

- **The off-screen scroll branch was not verified on a real narrow viewport.**
  The browser harness could not change the inner viewport width (`resize_window`
  left `innerWidth` at 1512), and faking it by offsetting the `<aside>` did not
  move the measured rect. That branch rests on its unit tests. **This and the
  `SELECTION_SETTLE_MS = 350` timing are the two things worth checking on a real
  phone** — they are the only remaining unknowns in the mobile path.
- **There are still no component tests anywhere under `tests/`.** Roborev has
  now flagged this twice. The decision logic is extracted and covered, but the
  event wiring (`mousedown`/`touchstart`/`COMPOSER_CLOSED_EVENT` listeners, the
  `activeCommentId` effect) is verified only by hand in a browser. Adding jsdom
  + `@testing-library/react` would close it and is a contained change.

---

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
