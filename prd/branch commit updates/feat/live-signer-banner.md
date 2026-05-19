# Branch Progress: feat/live-signer-banner

## Progress Update as of 2026-05-19 17:00 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Task 7 complete: `src/app/layout.tsx` made async, `getSignatureCount()` called server-side with a try/catch fallback to 0, `LiveSignersProvider` and `LiveSignerBanner` wired in. TypeScript type-check and `pnpm build` both pass clean (all 38 pages generated, every route dynamic as expected).

### Detail of changes made:
- **`src/app/layout.tsx`**: Converted to `async function`, added imports for `getSignatureCount`, `LiveSignersProvider`, and `LiveSignerBanner`. The DB call is wrapped in try/catch so a missing env or DB error gracefully falls back to `initialCount = 0` rather than crashing the build. `MyAccountButton`, `LiveSignerBanner`, and `{children}` are all nested inside `<LiveSignersProvider initialCount={initialCount}>` so all consumers can reach `useLiveSigners()`.
- `.env.local` was absent from the worktree; symlinked from the main repo dir to unblock the build. The Clerk publishableKey and DATABASE_URL errors that appeared on the first build attempt were both due to the missing symlink — not a code issue.

### Potential concerns to address:
- The worktree lacks its own `.env.local`; the symlink to the main repo's file works for local dev and build but any CI runner that checks out only the worktree ref will need the env vars provisioned separately. This is a pre-existing condition, not introduced by Task 7.

---

## Progress Update as of 2026-05-19 16:15 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Addressed three quality-review items on Task 6 (`LiveSignerBanner`): added `aria-hidden="true"` to the decorative arrow span, removed the dead `transition-transform` Tailwind class (shadowed by the inline `style.transition` string), and added an explanatory comment on the `onClick` handler. TypeScript type-check passes clean. The reviewer's fourth suggestion — removing `rendered` from Effect 2's dependency array — was deliberately NOT applied; see plan notes for why `rendered` is required there.

### Detail of changes made:
- **`src/app/LiveSignerBanner.tsx`**:
  - `<span className="ml-1 text-zinc-400" aria-hidden="true">→</span>` — screen readers no longer announce the Unicode rightwards arrow.
  - Removed `transition-transform` from the Link's `className`; the inline `style.transition` string fully owns the transition. The `hover:scale-[1.02]` Tailwind class stays (it sets the `scale` CSS property which the inline transition string animates).
  - Added comment above `onClick`: `// Trigger exit early; the timeline effect cancels the in-flight enter/hold timer on re-run.`

### Potential concerns to address:
- `rendered` remains in Effect 2's dependency array intentionally — removing it would prevent the enter→hold timer from starting after the provider drains the next queued event (because `phase` stays `"enter"` across the reset and no phase-change triggers the effect without `rendered` in the deps).

---

## Progress Update as of 2026-05-19 16:00 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Implemented Task 6: `LiveSignerBanner` client component at `src/app/LiveSignerBanner.tsx` and appended a `prefers-reduced-motion` override for `.glass-banner` to `src/app/globals.css`. TypeScript type-check passes with no errors. (Note: Task 5 commit `e22fe7c` — `SignatureCount` client component — shipped without a progress log entry; this entry covers both Tasks 5 and 6 so the narrative is continuous.)

### Detail of changes made:
- **`src/app/LiveSignerBanner.tsx`** (new): `"use client"` component. Consumes `useLiveSigners()` from `LiveSignersProvider`. Key design points:
  - `rendered` state locks the displayed event so a mid-animation provider swap cannot visually glitch the banner. The component only picks up a new `currentEvent` when `rendered` is `null`.
  - Phase state machine: `"enter"` (0 → 240ms, translates in + fades in) → `"hold"` (240ms → 5240ms, fully visible) → `"exit"` (5240ms → 5480ms, translates out + fades out) → idle (calls `onEventFinished()` + resets `rendered` to `null`).
  - Transitions driven by `setTimeout` in a `useEffect` keyed on `[phase, rendered, onEventFinished]`. Each arm returns a cleanup that clears its own timer.
  - Click on the link calls `setPhase("exit")` immediately, cutting the hold short — the banner exits, then calls `onEventFinished()` normally after 240ms.
  - Layout: fixed, full-width flex container with `z-50 top-6`. Link is the visible pill; outer `div` is `pointer-events-none` so the pill receives clicks but the transparent area does not.
  - Accessibility: outer `div` has `aria-live="polite"` and `role="status"`.
  - CSS hook: `.glass-banner` class on the link lets globals.css override transitions for `prefers-reduced-motion` without touching the component.
- **`src/app/globals.css`**: Appended `@media (prefers-reduced-motion: reduce) { .glass-banner { transition: opacity 240ms ease !important; transform: none !important; } }`. This disables the Y-translate entirely for users who prefer reduced motion while preserving the opacity fade (which is still useful as a presence cue).

### Potential concerns to address:
- Banner not yet rendered anywhere — wired into root layout in Task 7. No smoke test possible until then.
- Pre-existing test failures in `tests/server/revoke.test.ts` and `tests/server/sign.test.ts` remain unrelated to this branch.

---

## Progress Update as of 2026-05-19 15:30 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Addressed Task 4 code-review feedback in `src/app/LiveSignersProvider.tsx`: fixed two bugs — Strict Mode double-invocation corrupting `isFirstPollRef`, and missing `AbortController` on the in-flight fetch.

### Detail of changes made:
- **`src/app/LiveSignersProvider.tsx`** — two changes:
  - **Issue 1 (Strict Mode reset):** Added `isFirstPollRef.current = true` to the cleanup return of the mount `useEffect`. In React 18 Strict Mode, effects mount → cleanup → remount; without the reset, the second mount skips the cold-start path and uses a potentially stale `cursorRef`.
  - **Issue 2 (AbortController):** `poll` now accepts an optional `AbortSignal` parameter and passes it to `fetch`. The mount `useEffect` creates an `AbortController`, threads `signal` through a `doPoll` wrapper, and calls `controller.abort()` in cleanup. `catch` block now filters `DOMException` with `name === "AbortError"` to suppress expected cancellation noise. Also changed `poll()` call sites to `void poll(signal)` to make the floating-promise explicit.
- TypeScript type-check (`pnpm tsc --noEmit`) passes with no errors.

### Potential concerns to address:
- No new concerns. Pre-existing test failures in `tests/server/revoke.test.ts` and `tests/server/sign.test.ts` remain unrelated to this branch.

---

## Progress Update as of 2026-05-19 15:15 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Implemented Task 4: `LiveSignersProvider` client component at `src/app/LiveSignersProvider.tsx`. The provider wraps `useReducer` (using the reducer from Task 3) with polling logic (60s interval + visibility-change catch-up) and exposes `count`, `currentEvent`, and `onEventFinished` via React Context. TypeScript type-check passes with no errors.

### Detail of changes made:
- **`src/app/LiveSignersProvider.tsx`** (new): `"use client"` component. Exports `LiveSignersProvider` and `useLiveSigners` hook. Key design points:
  - `useReducer` initialized via `initialLiveSignersState(initialCount)` — count seeds from the server-rendered prop so first paint is never zero.
  - `cursorRef` mirrors `state.latestSignedAt` via a `useEffect`. This lets the polling closure read the latest cursor without being in its dependency array, so the `setInterval` is never restarted when state changes.
  - `isFirstPollRef` distinguishes the immediate cold-start poll from subsequent interval polls; flipped to `false` after first dispatch.
  - `poll` is a `useCallback` with an empty dep array (safe because it reads only refs). It builds the URL with or without `?since=`, validates the response shape via `isValidPollResponse`, then dispatches `poll-response`.
  - Mount `useEffect`: fires `poll()` immediately, starts 60s `setInterval` (skips if tab hidden), and adds `visibilitychange` listener that polls on becoming visible. Cleans up both on unmount.
  - Context value: `{ count, currentEvent, onEventFinished }` — the three fields the banner and count component need.

### Potential concerns to address:
- The provider is not yet rendered anywhere — wired into the root layout in Task 7. No smoke test is possible until then.
- Pre-existing test failures in `tests/server/revoke.test.ts` and `tests/server/sign.test.ts` remain unrelated to this branch.

---

## Progress Update as of 2026-05-19 14:45 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Addressed Task 3 code-review feedback: added exhaustiveness check to the reducer switch statement and tightened the queue-cap test assertion. All 8 reducer tests still pass.

### Detail of changes made:
- **`src/app/live-signers-reducer.ts`**: Added `default` clause to the `switch` using a `never` assertion (`const _exhaustive: never = action; return _exhaustive;`). TypeScript will now flag any unhandled action type at compile time rather than silently returning `undefined` at runtime.
- **`tests/app/live-signers-reducer.test.ts`**: Changed the queue-cap assertion from `toBeLessThanOrEqual(QUEUE_CAP)` to `toBe(QUEUE_CAP)`. The scenario starts with empty state and 10 incoming signers; after draining one to `currentEvent`, exactly `QUEUE_CAP` (= 5) items must be in the queue — the looser assertion would have passed even with an empty queue.

### Potential concerns to address:
- Pre-existing test failures in `tests/server/revoke.test.ts` and `tests/server/sign.test.ts` remain unrelated to this branch.

---

## Progress Update as of 2026-05-19 15:00 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Implemented Task 3: pure `liveSignersReducer` at `src/app/live-signers-reducer.ts` with 8 Vitest unit tests. All 8 tests pass; the 2 pre-existing failures in `revoke.test.ts` and `sign.test.ts` are unchanged.

### Detail of changes made:
- **`src/app/live-signers-reducer.ts`** (new): Exports `LiveSignerEvent`, `LiveSignersState`, `LiveSignersAction` types, `QUEUE_CAP = 5` constant, `initialLiveSignersState(count)` factory, and `liveSignersReducer(state, action)`. Two action types: `poll-response` (handles cold-start vs. regular polling, reverses server newest-first to oldest-first queue order, caps queue at `QUEUE_CAP`, drains head to `currentEvent` when banner is idle) and `event-finished` (advances queue head to `currentEvent` or clears it). `latestSignedAt` tracks the newest `signedAt` seen — used by the provider (Task 4) as the `?since=` cursor for subsequent poll requests.
- **`tests/app/live-signers-reducer.test.ts`** (new): 8 tests in 4 `describe` blocks: (1) initial state seeds count from prop, (2) cold-start with no signers updates count only, (3) cold-start with signers promotes most recent to `currentEvent` and queues nothing, (4) regular poll reverses to oldest-first and drains head, (5) regular poll does not displace active `currentEvent`, (6) queue cap respected at `QUEUE_CAP`, (7) `event-finished` with non-empty queue advances to next, (8) `event-finished` with empty queue clears `currentEvent`. No mocks needed — pure function.
- **Design decision**: `LiveSignerEvent.signedAt` is `string` (ISO), not `Date`. This is intentional — it is the client-side wire shape returned by `NextResponse.json()` (which serializes `Date` → ISO string). Task 4's provider will use `RecentSignerEvent` from the API layer and accept the JSON payload directly without converting types.

### Potential concerns to address:
- **Pre-existing test failures** in `tests/server/revoke.test.ts` (`relation "reports" does not exist`) and `tests/server/sign.test.ts` (transaction rollback assertion) remain. Not regressions.

---

## Progress Update as of 2026-05-19 14:45 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Implemented Task 2: `GET /api/signers/recent` route handler with 4 Vitest tests using mocked queries. All 4 new tests pass; pre-existing failures in revoke.test.ts and sign.test.ts are unrelated.

### Detail of changes made:
- **`src/app/api/signers/recent/route.ts`** (new): Exports `dynamic = "force-dynamic"` and named `GET(request: NextRequest)` handler. Parses optional `?since=` ISO-8601 query param, returning 400 if invalid. Calls `getSignatureCount()` and `listRecentSignersSince(since)` in parallel with `Promise.all`. Returns `{ count, newSigners }` JSON with `Cache-Control: no-store`. Catches DB errors and returns `{ error: "Internal server error" }` with status 500 — error message is a static string so no internal details can leak.
- **`tests/app/api/signers.recent.test.ts`** (new): Four tests using `vi.mock("@/lib/db/queries", ...)` to mock both query functions. Tests cover: (1) cold-start shape verification including `Cache-Control: no-store` header and `Date` → ISO string serialization, (2) `since` cursor pass-through as a `Date` instance, (3) 400 on invalid `since`, (4) 500 on DB error without leaking internal error message content.
- **Next.js 16 docs confirmed**: `request.nextUrl.searchParams.get(...)` remains correct; `export const dynamic = "force-dynamic"` is still the right opt-out; named `GET` export receiving `NextRequest` is unchanged. One note: the docs show both `NextRequest` and bare `Request` as valid — the plan uses `NextRequest` which is a superset and the right choice for `nextUrl` access.

### Potential concerns to address:
- **Pre-existing test failures** in `tests/server/revoke.test.ts` (`relation "reports" does not exist`) and `tests/server/sign.test.ts` (transaction rollback assertion) were failing before this task. Not regressions.
- **`console.error` in the 500 path** will print the full error (including DB credentials if present) to the server log. This is intentional — operators need the real error; the client only receives "Internal server error". The test verifies the response body is clean.

---

## Progress Update as of 2026-05-19 14:30 Pacific
*(Most recent updates at top)*

## Progress Update as of 2026-05-19 14:30 Pacific

### Summary of changes since last update
Implemented Task 1: added `listRecentSignersSince` DB query function in `src/lib/db/queries.ts` with 4 Vitest tests against pglite. All 4 new tests pass; the 2 pre-existing failures in `tests/server/revoke.test.ts` and `tests/server/sign.test.ts` are unrelated to this task.

### Detail of changes made:
- **`src/lib/db/queries.ts`**: Added `gt`, `and`, `isNull` to the drizzle-orm import. Added `RecentSignerEvent` interface (`id`, `displayName`, `locationText`, `signedAt`) and `SIXTY_MINUTES_MS` constant. Implemented `listRecentSignersSince(since: Date | null, db: any = null)` which joins `signatures` → `signers`, filters with `gt(signatures.signedAt, cutoff)` and `isNull(signers.softBannedAt)`, orders by `desc(signatures.signedAt)`. When `since` is `null`, `cutoff` defaults to 60 minutes ago.
- **`tests/lib/db.queries.test.ts`**: Added `listRecentSignersSince` to the import. Added a new `describe("listRecentSignersSince")` block with a `seedSigner` helper that inserts a signer + consent record + signature in one call. Four tests cover: (1) `since=null` 60-minute window, (2) `since=<timestamp>` strictly-after cursor, (3) soft-banned exclusion, (4) descending order.
- **`tests/_helpers/pglite-db.ts`**: No changes needed — `soft_banned_at` and `notification_preference` columns were already present in the test DDL.

### Potential concerns to address:
- **Pre-existing test failures** in `tests/server/revoke.test.ts` (`relation "reports" does not exist`) and `tests/server/sign.test.ts` (transaction rollback assertion) were failing before this task. These are not regressions from Task 1.
- **`db` parameter position** differs from `listSignatures(db, opts)` — the new function uses `(since, db)` as specified in the plan for clarity. Future callers should be aware of this arg order.

---

### Summary of changes since last update
Owner reviewed the design spec and approved. Wrote the implementation plan at `docs/superpowers/plans/2026-05-19-live-signer-banner.md` — 10 tasks, all TDD-style with bite-sized steps and complete code. Ready to hand off to subagent-driven-development or executing-plans for implementation.

### Detail of changes made:
- **Plan saved to** `docs/superpowers/plans/2026-05-19-live-signer-banner.md`. Header includes the writing-plans skill convention (REQUIRED SUB-SKILL line, checkbox steps, file structure inventory at top).
- **10 tasks** decomposing the spec, each ending in a green commit:
  - Task 0 — orientation: read the Next.js 16 route handler + layout docs (no-commit). Mirrors the convention from Plan 1 to defend against stale training data.
  - Task 1 — `listRecentSignersSince` query in `src/lib/db/queries.ts` with 4 Vitest tests against pglite (past-60-min filter, since-cursor filter, soft-banned exclusion, ordering desc).
  - Task 2 — `GET /api/signers/recent` route handler with 4 tests (cold-start shape, since cursor pass-through, 400 on invalid since, 500 on DB error without leaking internals).
  - Task 3 — pure reducer at `src/app/live-signers-reducer.ts` with 8 unit tests covering cold-start single-replay, regular FIFO queue, queue cap, no-displace-during-show, event-finished drain.
  - Task 4 — `LiveSignersProvider` client component (no unit tests; logic is the tested reducer + glue). Owns 60s `setInterval` + `visibilitychange` handler + cursor ref.
  - Task 5 — trivial `SignatureCount` client component (no tests, no commit by itself).
  - Task 6 — `LiveSignerBanner` with phase-based animation state machine and a `globals.css` `prefers-reduced-motion` override.
  - Task 7 — wire provider + banner into `src/app/layout.tsx`. Layout becomes async to call `getSignatureCount()` once per request; passes that as `initialCount` to the provider so first paint isn't zero.
  - Task 8 — replace the three `{signatureCount.toLocaleString()}` usages across `page.tsx` and `FloatingSignButton.tsx` with `<SignatureCount />`. Notes the conflict points with hotfix PR #12 and which version to keep depending on merge order.
  - Task 9 — manual smoke test checklist (cold-start, live sign during foreground, background-tab catch-up, quiet period, reduced-motion, mobile).
- **Tests use the existing pglite pattern** (`tests/_helpers/pglite-db.ts`). Task 1 Step 1 also adds a defensive `soft_banned_at timestamptz` column to the test DDL if it's missing — drift between the Drizzle schema and the test DDL is a known maintenance burden, called out in the original Plan 1 progress log.
- **Three classes of test coverage:** (1) DB query tests against pglite; (2) route handler tests with mocked queries via `vi.mock`; (3) pure reducer tests with no mocks. UI components (provider, banner, count) are explicitly not unit-tested; manual smoke in Task 9 covers them. This split matches the spec's testing section.
- **Self-review at bottom of the plan** confirms spec coverage (all 12 sections), no placeholders, type consistency across tasks (the `LiveSignerEvent` type matches across reducer, provider, and banner; `signedAt` is `Date` in the DB query type and `string` on the wire/client, handled by NextResponse.json's automatic Date → ISO conversion).

### Potential concerns to address:
- **Hotfix PR #12 hasn't merged yet.** Tasks 1 and 8 touch files (`page.tsx`, `FloatingSignButton.tsx`) that #12 also modifies. Task 8 documents which version to keep depending on merge order. If #12 lands before this work starts, rebase onto main and the conflict resolves cleanly. If implementation starts before #12 merges, expect conflicts on those two files during the eventual rebase.
- **Count grammar wobble at count=1.** Mid-page "Join X other real people who have signed" becomes grammatically incorrect when count=1 (says "1 other real people"). The plan accepts this and proposes a tiny `<JoinClause />` client component as a follow-up if needed. Total time at count=1 is moments per project lifetime, so deferred.
- **Layout becomes dynamic.** Adding `await getSignatureCount()` in the root layout forces every page response to do a single `SELECT count(*)` against Postgres. Pages were already dynamic (`force-dynamic`), so no regression — but worth noting if static export is ever pursued. Decision: trade the count query (cheap, indexed) for one source of truth across the site.
- **Implementation not started.** Plan written; spec reviewed and approved; no code yet. Next session should invoke subagent-driven-development (recommended) or executing-plans against this plan file.

---

## Progress Update as of 2026-05-19 14:15 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
First entry. Brainstormed a "live signer banner" feature with the project owner via the superpowers brainstorming skill (using the new visual companion to compare three banner-placement options). Captured the agreed design at `docs/superpowers/specs/2026-05-19-live-signer-banner-design.md`. Branch is off `main`; no application code touched in this commit. Next step is the implementation plan via the writing-plans skill, after the owner reviews the committed spec.

### Detail of changes made:
- **Design spec at `docs/superpowers/specs/2026-05-19-live-signer-banner-design.md`** (~300 lines). Sections 1–12 cover goal, scope (in + out), decisions log (8 rows captured from the brainstorming dialogue), architecture diagram, API contract, client architecture (provider + banner + count component), cold-start behavior, banner UX details, privacy posture, error handling, testing, and deferred items.
- **All eight architectural decisions made during brainstorming are captured in Section 3 (Decisions log)** so a future implementer doesn't need to re-derive them. Key calls:
  - Placement: floating pill near top, matching the existing "Join X others" glass-pill design language (user chose option B from the visual mockup comparison).
  - Realtime: polling every 60s (user's call — chose simplicity over instant push; trivially upgradable to SSE later if sign rate climbs).
  - Cold-start: replay the most recent signer iff signed within the past 60 minutes; otherwise no replay. Older signers in the cold-start window are folded silently into `count`.
  - Count display: a single `<SignatureCount />` client component replaces the three `{signatureCount.toLocaleString()}` usages across `page.tsx` and `FloatingSignButton.tsx`, reading from the same provider that drives the banner.
- **Accessibility:** spec mandates `aria-live="polite"` + `role="status"` on the banner container, and `prefers-reduced-motion: reduce` honored in the keyframe definitions. Folded into the banner UX section as a requirement (not a nice-to-have).
- **API contract is intentionally tiny:** one route, `GET /api/signers/recent?since=<iso?>`, returns `{ count, newSigners[] }`. Soft-banned signers excluded from `newSigners` but still counted in `count` (banner is more prominent than the static `/signers` list, so safer-than-the-list posture).
- **Privacy posture is explicit (Section 9):** banner exposes exactly the fields already publicly visible on `/signers` and `/signatories/[id]`. No new exposure.

### Potential concerns to address:
- **Branch conflict risk with PR #12 (`hotfix/mobile-hero-overflow`):** that PR modifies `FloatingSignButton.tsx` and `page.tsx`, both of which this feature also needs to edit (to swap the count for `<SignatureCount />`). Plan: wait for #12 to merge before implementing, or rebase `feat/live-signer-banner` onto `hotfix/mobile-hero-overflow` if we need to move in parallel. The spec is just markdown so no conflict at this stage.
- **Spec hasn't been reviewed by the owner yet.** Per the brainstorming flow, the owner reviews the committed spec before the implementation plan is written. If the owner wants any changes — banner content, animation timing, cold-start threshold, etc. — they edit before the plan is generated. Implementation has not started.
- **No SSE / live-push fallback path implemented or planned.** Section 12 lists it as deferred. Acceptable for current sign rate (~days between signs); decision should be revisited if the sign rate climbs above ~1/min.

---
