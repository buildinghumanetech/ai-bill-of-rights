# Branch Progress: sparkle/agent-c85ecd09-985f-4a6d-a9fc-64dcda1dafe9

## Progress Update as of [2026-07-26 20:00 Pacific]
*(Most recent updates at top)*

### Summary of changes since last update

The test database is now **generated from `src/lib/db/schema.ts`** instead of being
mirrored by hand. `tests/_helpers/pglite-db.ts` used to carry ~200 lines of raw DDL
transcribed by eye from schema.ts; that mirror is deleted and `createTestDb()` now
runs `drizzle-kit`'s own `generateMigration(emptySnapshot, schemaSnapshot)` and
replays the resulting SQL into each fresh PGlite instance. Building both databases
and diffing their `pg_catalog` surfaced nine real divergences (detailed below); the
most serious was that four partial indexes — including `selfies_signer_active_unique`,
which is the *only* enforcement of "at most one active selfie per signer" — existed
in the test DDL and in `drizzle/0002` but **not** in schema.ts, meaning the next
`drizzle-kit push` would have dropped them. Those four are now declared in schema.ts.
Also folded the referral-FK guard into `db.signers-referral-columns.test.ts` (now
asserting the live catalog rather than drizzle metadata), deleted the stopgap
`db.referral-fk-drift.test.ts`, and made `drizzle/0008` honest about the fact that
`drizzle-kit migrate` never applies it.

### Detail of changes made:

- **`tests/_helpers/pglite-db.ts` — rewritten.** `createTestDb()` keeps its exact
  signature and behaviour (fresh isolated in-memory Postgres per call, drizzle-bound,
  same `TestDb` return type), so no existing test changed. Implementation:
  - `generateDrizzleJson`/`generateMigration` from `drizzle-kit/api` produce the same
    SQL `drizzle-kit generate` would emit for a from-scratch database.
  - **Loaded via `createRequire(import.meta.url)`, not a bare import.** drizzle-kit's
    ESM build (`api.mjs`) is bundled with a `__require` shim that throws
    `Dynamic require of "fs" is not supported` on load. The CJS build (`api.js`) is
    fine. This is the single non-obvious thing about the file — do not "clean it up"
    into an `import`.
  - `pushSchema` was considered and rejected: it introspects a live database and is
    designed to *diff*, which is both slower and pointless against an empty PGlite.
  - The generation is memoised in a module-scope promise (`schemaDdl()`); it costs
    ~20ms once, versus `createTestDb()` being called by dozens of tests. Each call
    then just `client.exec`s the cached SQL string. Full-suite wall clock went from
    ~78s to ~35s (the old hand DDL was one giant multi-statement exec; the generated
    form is not obviously the cause, but there is certainly no regression).

- **`src/lib/db/schema.ts` — four partial indexes added.** `selfies_signer_active_unique`,
  `selfies_status_submitted_at_idx`, `selfie_reports_selfie_unresolved_idx`,
  `attestations_version_published`. All four were declared *only* in migration SQL
  (`drizzle/0002`, `0003`) and in the hand-written test DDL. The deploy path is
  `drizzle-kit push`, which reconciles against schema.ts and **drops indexes it does
  not know about** — the exact hazard already called out in the comment above
  `signers_referred_by_idx` (schema.ts:84-89). `selfies_signer_active_unique` is not a
  performance hint: the selfie design spec (2026-05-19, §5.5) designates it as the
  database-layer enforcement of "at most one active selfie per signer".
  The stale comment claiming drizzle 0.36's partial-index surface was too fragile to
  declare here was replaced — verified that drizzle-orm 0.36.4 + drizzle-kit 0.30.6
  emit `.where()` clauses correctly. `attestations` had to be converted from the
  2-arg `pgTable(name, cols)` form to the 3-arg form to take an index callback.

- **`tests/lib/db.referral-fk-drift.test.ts` — deleted**, both tests folded/retired:
  - Test 2 asserted on the *source text* of the helper via regex. Obsolete and wrong
    once the helper contains no DDL. Gone.
  - Test 1 is now `tests/lib/db.signers-referral-columns.test.ts` →
    `describe("signers.referred_by_signer_id foreign key")`. It queries `pg_constraint`
    on a real generated database and asserts `confdeltype = 'n'` (SET NULL) — the
    effective catalog behaviour, not drizzle's in-memory metadata. It also asserts
    **exactly one** FK on the column and that it targets `signers.id`; the old
    `foreignKeys.find(...)` silently took the first match and never checked where it
    pointed.

- **`drizzle/0008_referral_fk_on_delete_set_null.sql` — header rewritten, DO block fixed.**
  - *Honesty:* chose to **state plainly that `push` is the only path that applies it**
    rather than register it in `_journal.json`. Registering 0005-0008 would require
    hand-authoring four snapshot files describing a database whose real history was
    written by `push`; that fiction rots the first time schema.ts changes. The header
    now says so, names the test that actually pins the behaviour, and says "do not
    assume it has run anywhere."
  - *Correctness:* the old block did `SELECT ... INTO ... LIMIT 1` then an
    unconditional `ADD CONSTRAINT` with a hardcoded name. A database carrying **both**
    historical FK names on the column — the exact drift the file exists to repair —
    dropped one, then collided with the survivor and aborted with `duplicate_object`.
    Now it `FOR ... LOOP`s over every matching constraint and wraps the ADD in
    `EXCEPTION WHEN duplicate_object`, the way 0007 does. Verified against PGlite
    across four scenarios (no FK / drizzle name / postgres default name / both names),
    each run twice for idempotency: the old file failed the both-names case with
    `constraint ... already exists`; the new one passes all four.

### Divergences found between the hand-written test DDL and schema.ts

Method: build a PGlite from each, diff `information_schema.columns`, `pg_indexes`,
and `pg_constraint`. **Columns were identical — zero drift.** The rest:

| # | Divergence | Which side was right | Why |
|---|---|---|---|
| 1 | `selfies_signer_active_unique` (partial unique) — test DDL only | **test DDL**; schema.ts fixed | Spec designates it as the DB-layer "one active selfie per signer" guarantee. `push` would drop it. |
| 2 | `selfies_status_submitted_at_idx` (partial) — test DDL only | **test DDL**; schema.ts fixed | Powers `/admin/selfies`. Same `push` hazard. |
| 3 | `selfie_reports_selfie_unresolved_idx` (partial) — test DDL only | **test DDL**; schema.ts fixed | Serves the open-report threshold check. Same hazard. |
| 4 | `attestations_version_published` (partial) — test DDL only | **test DDL**; schema.ts fixed | Serves the public published-attestations listing. Same hazard. |
| 5 | 7 CHECK constraints (`signers.verification_method`, `signers.notification_preference`, `proposed_edits.kind`, `proposed_edits.status`, `selfies.status`, `selfies.capture_method`, `selfie_reports.resolution`) — test DDL only | **schema.ts** (left alone) | Drizzle's `text(col, {enum})` is a *TypeScript*-level constraint; drizzle-kit emits no CHECK for it, so production has never had these. `selfies.status` / `capture_method` / `resolution` aren't even `{enum}` in schema.ts — those checks were invented wholesale by whoever wrote the mirror. Tests were enforcing a guarantee production does not have. See concerns below. |
| 6 | `PRIMARY KEY (proposal_id, signer_id)` on `proposal_upvotes` — test DDL only | **schema.ts** (left alone) | schema.ts declares a `uniqueIndex` on the same pair; both columns are `notNull`. Semantically equivalent for every query the app runs. |
| 7 | `PRIMARY KEY (comment_id, signer_id)` on `comment_upvotes` — test DDL only | **schema.ts** (left alone) | Same as #6. |
| 8 | Constraint/index *names*: hand DDL got Postgres defaults (`signers_clerk_user_id_key`, `*_fkey`), drizzle emits `signers_clerk_user_id_unique`, `*_id_fk` | **schema.ts** | Pure naming; identical definitions. Nothing asserts on these names. Worth knowing if anyone writes a name-based `DROP CONSTRAINT`. |
| 9 | `selfies_status_submitted_at_idx` sort: hand DDL `DESC` (NULLS FIRST), drizzle `DESC NULLS LAST` | **schema.ts** | `submitted_at` is `NOT NULL`, so the null ordering is unreachable. |

No change was made to schema.ts to make a test pass. The four index additions are
"schema.ts was wrong" — it was one `push` away from dropping a correctness constraint.

### Mutation verification (the point of the exercise)

Deleted `{ onDelete: "set null" }` from `signers.referredBySignerId` in schema.ts and
re-ran. **Before this branch that mutation left all 403 tests green.** After:

```
× signer-deletion.referrals > succeeds via the revoke path (deleteSigner)
× signer-deletion.referrals > succeeds via the self-service path (removeMySignature)
× signer-deletion.referrals > succeeds via the admin path (deleteSignerAction)
× signer-deletion.referrals > nulls attribution for every person the deleted signer brought in
× signer-deletion.referrals > leaves other people's attribution alone
× db.signers-referral-columns > is SET NULL on delete, and points at signers.id
    → expected 'a' to be 'n'
Tests  6 failed | 8 passed (14)
```

Restored; `git diff src/` clean against the restored state; the same two files return
14/14 passing.

### Test / typecheck status

- `./node_modules/.bin/vitest run` → **56 files / 404 tests passing**, 0 failing.
  (Baseline was 57/405; `db.referral-fk-drift.test.ts` contributed 2 tests and was
  deleted, and 1 replacement test was added: 405 − 2 + 1 = 404.)
- `./node_modules/.bin/tsc --noEmit` → clean, exit 0.

### Potential concerns to address:

- **Production almost certainly lacks the four partial indexes** (divergence #1-4). If
  they were ever created by a manual migration run, `push` has had many opportunities
  to drop them since. The next `drizzle-kit push` after this branch merges will try to
  `CREATE UNIQUE INDEX selfies_signer_active_unique` — **if prod has ever accumulated
  two active selfies for one signer, that push will fail.** Worth running the dedupe
  query against Neon before deploying:
  `select signer_id, count(*) from selfies where status='approved' and auto_hidden_at is null and removed_at is null and replaced_by_selfie_id is null group by 1 having count(*) > 1;`
- **There are no CHECK constraints in production** on any of the seven enum-ish columns
  (divergence #5), and now the test database honestly reflects that. Nothing broke —
  no test depended on the DB rejecting a bad enum value — but that means bad values in
  those columns are prevented only by TypeScript and by whatever validation the server
  actions do. drizzle-orm 0.36 does export `check()`; adding them is a separate,
  deliberate decision with real migration risk against existing rows, so it was left
  out of this branch rather than smuggled in.
- **`proposal_upvotes` and `comment_upvotes` ship with no primary key at all**
  (divergences #6-7), only a unique index. Functionally fine; some tooling (logical
  replication, certain ORMs, `pg_dump --data-only` conflict handling) cares.
- **`drizzle/meta/_journal.json` still stops at `0004` and the snapshots at `0001`.**
  0008's header is now honest about it, but 0005, 0006 and 0007 still carry no such
  caveat. Anyone reading those files will still assume `migrate` applies them. Fixing
  the other three headers is a small, obvious follow-up.
- **`node_modules` was absent in this worktree**; `corepack pnpm install` was required
  and it writes a placeholder into `pnpm-workspace.yaml` that must be reverted with
  `git checkout -- pnpm-workspace.yaml`. Not committed here.
- The `createRequire` in `pglite-db.ts` is load-bearing (see above). A future
  drizzle-kit that ships a working ESM build would let it become a plain import;
  until then, an "unused import cleanup" that touches it will break every DB test.

---
