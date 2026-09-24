# Branch Progress: fix/lint-clean

## Progress Update as of [2026-09-24 05:00 Pacific]
*(Most recent updates at top)*

### Summary of changes since last update
Rebased onto current `main` (13 commits had landed since the branch point) and found
**2 new lint errors in that new code** — which this branch's `--max-warnings 0` gate
would have failed on. Fixed; lint clean again, suite **1019/1019** (98 files).

### Detail of changes made:
- **The rebase was the point, not housekeeping.** The PR's earlier green run proved
  nothing about code that landed afterwards, and because this branch is what makes
  lint fail the build, any lint error merged in the meantime becomes this branch's
  problem. Two had: `ProposeRightForm.tsx` (restoring a localStorage draft after
  mount) and a new `SignModal` effect (`startInSignIn`, from the /propose signer-gate
  work). Both `react-hooks/set-state-in-effect`.
- **Both got the same justified disable as their siblings.** Neither is derivable
  during render: localStorage does not exist on the server (the existing comment in
  `ProposeRightForm` already says so), and the `startInSignIn` effect is modal
  lifecycle sitting right below the reset effect that clears it.

### Potential concerns to address:
- **This is now a demonstrated recurring tax, not a hypothetical.** Two fresh hits
  appeared within hours of the branch being written, both from ordinary feature work.
  `react-hooks/set-state-in-effect` fires on legitimate post-mount patterns, so with
  `--max-warnings 0` every new component that restores browser-only state will fail
  CI until someone adds a disable. That deserves a project decision — keep it as an
  error and accept per-site disables, or set it to `warn` and rely on review — rather
  than each author discovering it. Flagged on the PR.
- **This branch will keep needing rebases while `main` moves this fast.** Nothing to
  fix; just do not trust an old green run on a branch that gates the build.

---

## Progress Update as of [2026-09-24 02:05 Pacific]
*(Most recent updates at top)*

### Summary of changes since last update
**Zero errors AND zero warnings** — `eslint --max-warnings 0` passes. Lint is now a
CI step alongside typecheck and tests. Suite 1005/1005, tsc clean.

### Detail of changes made:
- **`react-hooks/set-state-in-effect` — 1 fixed properly, 7 disabled with reasons.**
  This needs stating plainly, because the split is a judgement call:
  - **Fixed:** `MentionTextarea`. Resetting the highlighted row now uses React's
    documented "adjust state when a prop changes" pattern — compare against the
    previous value during render and set immediately. This is a genuine behaviour
    improvement, not just rule satisfaction: the effect painted one frame with a
    stale index first (highlighting row 3 of a list that just became two rows
    long) before correcting. 27 mention tests cover it and pass.
  - **Disabled, per-site, with a written justification each:** `SignedAt` (the
    server has no timezone, so re-formatting in local time after hydration is the
    whole point), `TabbedDocument` (reads `window.location` on mount for a
    `?c=` deep link — the URL is not a prop and does not exist during server
    render), `SignModal`'s async status fetch (a request that can only start after
    mount), `LiveSignerBanner` (an animation timeline that deliberately lags the
    prop), `CommentsColumn` (centralised so a keyboard user does not leave the
    dedupe guard stale), and the two modal reset-on-close effects.
  - The rule cannot distinguish "derived state written the wrong way" from "a real
    side effect whose result is state". For the first, it is right and was fixed.
    For the rest, refactoring to satisfy it would change user-visible behaviour in
    components with no browser-test coverage — a bad trade against a linter.
  - **The two modal resets are the weakest of the seven.** `key` on the caller is
    the idiomatic fix and would genuinely be better; it changes every call site, so
    it is flagged as a follow-up rather than smuggled into a lint PR.
- **10 `no-unused-vars` warnings cleared** by deleting genuinely dead imports
  (`sum`, `signatures`, `getSignerById`, `eq`, `and`, a stray `Db` my own earlier
  edit added). One was a bare `await import("drizzle-orm")` left with no binding.
- **`eslint.config.mjs` now knows the `_` convention.** `_reason` / `_comments` are
  deliberate "required by the signature, unused" bindings that the codebase already
  uses, so `no-unused-vars` gets `argsIgnorePattern: "^_"` rather than each site
  carrying a standing warning.
- **CI runs `eslint --max-warnings 0`**, and all three steps are `!cancelled()` so
  one red run reports lint, types and tests together rather than stopping at the
  first.

### Potential concerns to address:
- **The CI job was renamed** `typecheck + tests` -> `lint + typecheck + tests`. If
  it had been configured as a required status check, that rename would break the
  requirement. Nothing is required yet, so this is the cheapest moment to do it —
  but whoever sets branch protection should use the new name.
- **`--max-warnings 0` is stricter than `pnpm lint`.** Deliberate: a warning nobody
  fails on is how this reached 149 unnoticed. The cost is that a newly-noisy rule
  fails CI until someone decides about it, which is the intended forcing function.
- **7 disables are suppression, not repair.** Each says why, but they are a real
  backlog item: the two modal resets in particular have a known better fix.

---

## Progress Update as of [2026-09-24 01:55 Pacific]
*(Most recent updates at top)*

### Summary of changes since last update
Cleared every remaining `no-explicit-any` and the unescaped-entity errors.
**59 -> 8 errors**, all 8 now the single rule left: `react-hooks/set-state-in-effect`.
tsc clean, suite 1005/1005.

### Detail of changes made:
- **`scripts/*` raw-SQL reads -> `Array<Record<string, unknown>>`.** These use the
  neon client directly (not drizzle), so `rowsOf` does not apply. `unknown` rather
  than a named shape is the proportionate level for one-off diagnostics that only
  print: it still forces narrowing for anything beyond printing, which `any` did
  not. `inspect-signer.ts` needed a real narrow, not a cast, because it indexes
  into `captured_fields`.
- **`tests/_helpers/captured-fields.ts` — a fixture builder.** Nine `{} as any`
  casts were hiding that `recordSignature` wants a complete 13-field
  `CapturedFields` (in production it always comes from `extractCapturedFields()`).
  The cast would equally have accepted a typo'd or renamed key. Now a rename
  breaks the fixture, which is the point. Defaults are empty strings so a test
  that depends on a value has to say so in its own override.
- **`sql.raw()` instead of `as any`** for the two literal UPDATE statements in
  `db.schema.selfies.test.ts` — that is the typed way to hand `execute()` a string.
- **Row predicates lost their `(r: any)`** in five test files. Nothing replaced
  them: the selects are properly typed now, so inference does the work. That is
  the clearest evidence the `Db` change bought something real.
- **Two casts kept, deliberately, and re-pointed at what they mean.** Passing
  `"garbage"` as a `RejectionReason` and omitting both `anchorId` and `proposalId`
  are the invalid inputs those tests exist to reject. They are now
  `as unknown as RejectionReason` / `as unknown as Parameters<...>[1]` with a
  comment, so the cast documents "the type is right, I am testing the runtime
  guard" instead of switching checking off.
- **`src/app/sign/profile/page.tsx`** — `&apos;` / `&ldquo;`-`&rdquo;`, matching the
  house style already used elsewhere in `src/` (49 `&apos;`, 7 `&ldquo;`).

### Potential concerns to address:
- **The 8 remaining errors are the only ones that can change runtime behaviour.**
  `react-hooks/set-state-in-effect` fires on a synchronous `setState` inside an
  effect, which causes an extra render pass and can loop. Each needs reading on its
  own; a blanket transformation would be a behaviour change disguised as a lint fix.
  Handled next, in their own commit, so they are reviewable separately.
- `pnpm lint` still reports 14 warnings. Warnings do not fail `eslint`, so they do
  not block adding lint to CI — but if CI ever adds `--max-warnings 0` they will.

---

## Progress Update as of [2026-09-24 01:45 Pacific]
*(Most recent updates at top)*

### Summary of changes since last update
First entry. Goal: get `pnpm lint` to zero errors so it can join `tsc` + `vitest`
in CI (deliberately left out of the CI workflow in PR #87 because it was red
repo-wide). Baseline was **149 errors / 10 warnings**; this commit takes it to
**59 errors** by typing the database layer properly. tsc clean, suite 1005/1005.

### Detail of changes made:
- **`src/lib/db/types.ts` — a real `Db` type, with no `any` in it.** 133 of the
  149 errors were `@typescript-eslint/no-explicit-any`, and 72 of those were the
  `db: any` convention. The convention existed for a real reason: production runs
  drizzle over neon-http, tests run it over pglite, and those are different
  types. But `PgDatabase<PgQueryResultHKT, typeof schema,
  ExtractTablesWithRelations<typeof schema>>` is the base both extend. Probed it
  first: both concrete drivers are assignable, and every operation the codebase
  performs (select/insert/update/delete, `.returning()`, `.orderBy()`, raw
  `execute`) typechecks through it. So `db: Db` costs nothing and restores
  checking on table names, column names and insert shapes across the data layer.
- **`src/lib/db/rows.ts` — `rowsOf<T>()`.** The genuine driver difference is
  `db.execute()`: neon-http resolves to an object with `.rows`, pglite resolves to
  the array. That was papered over in ~25 places with `(x as any[])`. Now narrowed
  once, with the row shape as a type argument so call sites state what they expect.
- **`src/lib/errors.ts` — `errorMessage` / `errorText` / `errorCode`.** Replaces
  `catch (err: any)`. Note this is not only cosmetic: the drivers wrap failures so
  a unique-violation's real text sits on `.cause`, which is exactly the flaw behind
  the intermittently-flaky duplicate-report catches flagged during the sign-up-PII
  work. `errorText` checks both, so those catches now match what they intended to.
- **Root-caused two `any` leaks rather than patching symptoms.** `getDefaultDb()`
  and `getDb()` returned untyped values, so `const client = db ?? getDefaultDb()`
  degraded a whole function to `any` — which is why one row mapper reported an
  implicit-any only after the parameter types were fixed. Typing the resolvers
  fixed the callers for free.
- **`$dynamic()` in `listReferredSigners`.** Typing `client` exposed a latent
  error: `q = q.limit(...)` cannot typecheck, because each drizzle builder method
  returns a type with that method removed. `$dynamic()` is drizzle's opt-in for
  conditional query building. Invisible while `client` was `any`.
- **Two deliberate partial test doubles now say so** (`as unknown as Db`) rather
  than the whole parameter being widened for their benefit.

### Potential concerns to address:
- **`Db` leaves the `execute` result kind unresolved on purpose.** Anything reading
  a raw `execute` still has to narrow — use `rowsOf`. Resolving it would require
  picking one driver's result shape and lying about the other.
- **59 errors remain**: 22 `as any[]` in one-off `scripts/`, ~17 `as any` in test
  fixtures, 10 `no-unused-vars`, 8 `react-hooks/set-state-in-effect`, 8
  `react/no-unescaped-entities`. The React ones are the only group that can change
  runtime behaviour, so they get handled last and on their own.
- **Nothing enforces lint yet** — that is the final commit on this branch, and it
  should not land until the count is actually zero.

---
