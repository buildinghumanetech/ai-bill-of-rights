# Branch Progress: feat/live-signer-banner

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
