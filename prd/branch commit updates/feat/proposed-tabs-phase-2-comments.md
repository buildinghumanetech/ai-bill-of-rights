# Branch Progress: feat/proposed-tabs-phase-2-comments

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
