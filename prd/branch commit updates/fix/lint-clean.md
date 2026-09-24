# Branch Progress: fix/lint-clean

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
