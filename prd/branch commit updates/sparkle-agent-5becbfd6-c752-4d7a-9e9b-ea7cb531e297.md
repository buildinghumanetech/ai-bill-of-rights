# Branch Progress: sparkle/agent-5becbfd6-c752-4d7a-9e9b-ea7cb531e297

## Progress Update as of 2026-07-25 09:15 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
First entry on this branch. Fixed the CONFIRMED HIGH-severity data-loss bug in the referral schema — `signers.referred_by_signer_id` had no `ON DELETE` action, so Postgres refused (SQLSTATE 23503) to delete any signer who had successfully referred someone, breaking account deletion and GDPR erasure on all three deletion paths — plus three smaller referral-core correctness gaps: a channel cookie that could desynchronise from its ref, attribution being lost outright on protected routes, and a docstring advertising a self-referral guard that cannot currently fire.

### Detail of changes made:

**1. `referred_by_signer_id` now has `ON DELETE SET NULL` (the data-loss fix).**
- `src/lib/db/schema.ts` — the self-reference gains `{ onDelete: "set null" }`. This file is the one that actually matters: the deploy path is `drizzle-kit push`, which reconciles the live database against schema.ts. SET NULL rather than CASCADE deliberately — attribution is a historical fact about how someone arrived, so it is the right casualty; CASCADE would delete real signers, which would be catastrophic.
- `drizzle/0008_referral_fk_on_delete_set_null.sql` — hand-written, idempotent, for the record and for anyone running `drizzle-kit migrate`. It looks the constraint up **by what it constrains rather than by name** (via `pg_constraint.conkey`), because drizzle-kit names it `signers_referred_by_signer_id_signers_id_fk` while a database built from inline DDL gets Postgres's default `signers_referred_by_signer_id_fkey` — dropping by a hardcoded name would silently no-op on one of the two.
- `tests/_helpers/pglite-db.ts` — the hand-mirrored DDL now says `references signers(id) on delete set null`, so the test database and schema.ts cannot drift.
- **No change was needed in the three deletion actions** (`me.ts` `removeMySignature`, `revoke.ts` `deleteSigner`, `admin.ts` `deleteSignerAction`). Once the constraint sets null, Postgres clears the referring rows itself. Clearing them in application code as well would be three more places to forget.

**2. `tests/server/signer-deletion.referrals.test.ts` (new, 6 tests) proves it on all three paths.**
- Each path deletes an inviter who referred someone and asserts two things: the delete SUCCEEDS, and the referred signer SURVIVES with `referredBySignerId` null (they must not be deleted). Plus: many invitees at once, other people's attribution left untouched, and deleting a signer who was themselves referred.
- Testing `me.ts` and `admin.ts` for real (not via a data-layer shim) needed one unusual thing: both reach the database through a lazy CommonJS `require("@/lib/db")`, and CJS resolution knows nothing about Vite's `@` alias or Vitest's module registry, so `vi.mock` alone throws MODULE_NOT_FOUND. The test patches `Module._load` — the hook that sits underneath `require` — and restores it in `afterAll`. `vi.resetModules()` per test keeps each action module's cached `_db` pointing at that test's fresh pglite database.

**3. `src/lib/referral/cookie.ts` — the ref/channel pair can no longer desynchronise.**
- In the `incomingRef && !alreadyAttributed` branch the channel cookie is now written **unconditionally**: set to the incoming channel, or explicitly cleared (empty value, `Max-Age=0`) when the link carries none. Previously it was only written when a channel was present, so a visitor who first arrived on `/?via=x` and later clicked a bare `/?ref=A` ended up with `ref=A, via=x` — crediting A with a share on a surface A never used. The comment claiming "the pair always describes the same share event" was false; it is now true, and is recorded as rule 3 in the module docstring.
- `tests/lib/referral.cookie.test.ts`: **"drops an unknown channel rather than storing it" intentionally changed** — it used to assert no channel cookie at all is emitted; it now asserts the channel cookie is emitted as an explicit clear (value `""`, `maxAge: 0`) and never carries the junk value. The assertion was strengthened, not weakened: it still pins that the unknown channel is not stored. Two new tests cover the stale-channel-cleared and stale-channel-overwritten cases.

**4. `src/proxy.ts` — attribution now survives protected routes.**
- Restructured: the referral cookies are computed **before** Clerk runs, and applied to whatever Clerk returns. `auth.protect()` throws its sign-in redirect, which clerkMiddleware catches and converts into a response the handler never sees — so anything sequenced after `protect()` inside the handler simply never executes. `captureReferral(req)` used to live there, meaning an unauthenticated visitor landing on `/sign/profile?ref=…` lost their attribution entirely. Those are links into the signing flow: the ones most likely to carry a ref.
- The default export is now a plain `proxy(req, event)` function that awaits `withClerk(...)` and decorates the result; `clerkMiddleware` is no longer the default export directly. `applyReferralCookies` re-wraps a bare `Response` into a `NextResponse` to get a cookie jar (Clerk only ever returns `NextResponse` today; this stops attribution evaporating if that changes).
- `tests/app/proxy.referral.test.ts` (new, 7 tests) mocks Clerk but reproduces the control flow that matters — `protect()` throws, the middleware converts it to a redirect — and asserts the ref cookie rides the redirect. Verified this suite FAILS against the previous `src/proxy.ts` (2 of 7 red) before the fix.

**5. `src/lib/referral/attribution.ts` — docstring no longer overclaims.**
- The self-referral guard is KEPT (one comparison, real value if anything ever calls the resolver from an UPDATE or a backfill), but the module docstring, the `clerkUserId` field doc, the function doc and the inline comment now all say plainly that it **cannot currently fire**: its only caller is the INSERT branch of `upsertSignerProfile`, which by definition runs when no signer row exists for that Clerk user, so the fetched row can never be theirs. The corresponding comment in `tests/server/profile.attribution.test.ts` was corrected the same way — the test pins the rule for a future caller, it is not evidence that self-referral is blocked in production.

### Verification (commands actually run, with results)
- **FK bug, BEFORE:** `./node_modules/.bin/vitest run tests/server/signer-deletion.referrals.test.ts` against the unfixed DDL → **5 failed | 1 passed**, every failure `update or delete on table "signers" violates foreign key constraint "signers_referred_by_signer_id_fkey"`.
- **FK bug, AFTER:** same command → **6 passed**.
- **Migration, standalone against pglite:** built the table exactly as 0007 left it, then applied `drizzle/0008`. Constraint `confdeltype` went `a` (no action) → `n` (set null); the DELETE went from `SQLSTATE=23503 … violates foreign key constraint` to `DELETE SUCCEEDED. remaining rows = [ { clerk_user_id: 'invitee', referred_by_signer_id: null } ]`. Applying the migration a second time reproduced the same result, confirming idempotency.
- **Proxy fix:** the new suite red (2/7) on the old `src/proxy.ts`, green (7/7) on the new one.
- **Full suite:** `./node_modules/.bin/vitest run` → **51 files / 351 tests, all passing** (baseline was 49 / 336; +2 files, +15 tests, nothing regressed).
- **Types:** `./node_modules/.bin/tsc --noEmit` → clean, exit 0.
- **Lint:** `./node_modules/.bin/eslint` over every touched file → one error, `no-explicit-any` on `resolveReferrerId(db: any, …)`, which is **pre-existing** (verified by running eslint on the stashed HEAD version of the file, same error at the pre-edit line number). Not introduced here and out of scope.

### Potential concerns to address:
- **Production still needs a deploy to pick this up.** The constraint only changes when `drizzle-kit push` (or the 0008 migration) runs against the live database. Until then, deleting a signer who referred someone still 23503s in prod — the schema.ts fix is necessary but not sufficient on its own.
- **Prod may carry either constraint name.** 0008 handles both by looking the FK up via `pg_constraint`, but if anyone has hand-added a *second* FK on that column the migration drops only the first one it finds.
- **The `Module._load` patch in the new deletion test is a sharp tool.** It is the only way to intercept the `require("@/lib/db")` that `me.ts`/`admin.ts` deliberately use, and it is restored in `afterAll`, but a future refactor of those modules to `await import()` would make it unnecessary — and would be the better fix.
- **Every `?ref=` arrival now emits a Set-Cookie clearing `abor_ref_via`** even when the visitor had no channel cookie. Harmless (one extra header on a rare path), and it is what makes the pairing invariant unconditional rather than dependent on trusting the incoming cookie header.
- **`resolveReferrerId(db: any, …)` remains untyped.** The `no-explicit-any` lint error predates this branch; typing it properly means threading the drizzle client type through, which is a change worth making separately.

---
