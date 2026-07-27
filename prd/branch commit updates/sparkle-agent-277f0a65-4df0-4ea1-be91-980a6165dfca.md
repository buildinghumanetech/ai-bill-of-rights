# Branch Progress: sparkle/agent-277f0a65-4df0-4ea1-be91-980a6165dfca

## Progress Update as of [2026-07-26 20:00 Pacific]
*(Most recent updates at top)*

### Summary of changes since last update

The analytics `referred` flag was derived from the raw attribution cookie rather than from what the database actually stored, so a signer whose referrer had since deleted their account reported `signature_completed{referred:true}` while `signers.referred_by_signer_id` was null — an unreconcilable and invisible discrepancy against `countReferralsBySigner`. `upsertSignerProfile` now returns the attribution it actually persisted alongside the id, and `recordSignatureFromModal` reads `referred` off that instead of off the cookie. `channel` was deliberately left cookie-derived and independent, and the contract between the two fields is now documented on `SignFromModalResult`.

### Detail of changes made:

- **`src/server/actions/profile.ts`** — `upsertSignerProfile` now returns a named `UpsertSignerProfileResult` (`{ id, referredBySignerId }`) instead of `{ id }`.
  - INSERT branch returns the value it already computed via `resolveReferrerId` — i.e. post-validation, so a dangling / malformed / lookup-failed ref comes back as `null`.
  - UPDATE branch returns `existing[0].referredBySignerId`, the attribution already on the row. That branch deliberately never *writes* attribution (attribution is a fact about how someone first arrived), so it must report the stored value, not the ref this call happened to carry. Two consequences that are now pinned by tests: a returning signer with old attribution reports it even when no ref cookie is present, and a ref arriving on a *later* visit reports `null` because it was dropped on the floor.
  - The result type carries a docstring saying explicitly that callers reporting attribution to analytics must read it from here, not from the cookie.
  - Fixed the false comment at the old lines 63–64 ("Validated against the signers table (and against self-referral)"). It contradicted the docstring in `src/lib/referral/attribution.ts`, which a previous commit corrected to say the self-referral guard **cannot fire on this call path** — the INSERT branch only runs when no signer row exists for that Clerk user, so the fetched row can never be theirs. The comment now says the same thing and points at that docstring.

- **`src/server/actions/sign-from-modal.ts`** — `recordSignatureFromModal` returns `referred: profile.referredBySignerId !== null`.
  - Fixed the false comment above `readReferralAttribution()`'s call site, which claimed "the same pair feeds the database write and the analytics event ... so they can never disagree". They demonstrably could. It now says the cookie is an *input* to the write, not the outcome of it.
  - **Decision on `channel`: kept independent of `referred`, and documented rather than suppressed.** `channel` is the `?via=` surface the visitor arrived from — that is a true fact about the arrival regardless of whether the ref survived, and "which surface converts" is exactly the question the field exists to answer. Blanking it when the referrer deleted their account would delete real surface data to preserve a symmetry nobody asked for, and would also contradict the pre-existing behaviour (and test) where a `?via=` link with no ref at all still reports its channel. So `referred:false, channel:"linkedin"` is a valid, expected event.
  - The `SignFromModalResult` docstring now states the two contracts precisely: `referred` means "`signers.referred_by_signer_id` is non-null — a row you can go and find", NOT "the visitor arrived carrying a ref cookie"; `channel` is the cookie's arrival surface and is independent.
  - `createSignerFromModal` was left alone — it does not report attribution to analytics.

- **`tests/server/profile.attribution.test.ts`** — new `describe("upsertSignerProfile — reporting what it actually persisted")` with 6 tests: returns the referrer stamped on INSERT; returns `null` for a ref naming a deleted signer; `null` for a malformed ref; `null` for an organic signer; returns the *original* attribution on the UPDATE branch (both when the call carries a different ref and when it carries none); and returns `null` on the UPDATE branch for a signer who was never attributed. Each asserts the returned value **and** the row, so the two cannot drift apart unnoticed.

- **`tests/server/sign-from-modal.attribution.test.ts`** — the `upsertSignerProfile` mock now reproduces the real function's two branches instead of returning a bare `{ id }`: a `liveReferrers` set (defaulting to the one valid `REFERRER_ID`) so a ref naming a missing row is dropped exactly as `resolveReferrerId` would, and an `attributionAlreadyOnRow` override to simulate the UPDATE branch. Both are reset in `beforeEach`. Three new tests: `referred:false` when the ref names a since-deleted signer (with the ref still reaching the write — dropping it is the writer's job); `channel` still reported in that same case; and `referred:true` off stored attribution with no ref cookie present.

- **Mutation-verified, both directions.** Reverting `sign-from-modal.ts` to `referred: attribution.ref !== null` reds all three new tests there (`expected true to be false` ×2, `expected false to be true`) and leaves the other 5 green. Separately, mutating the profile UPDATE branch to echo `input.referredBySignerId` instead of the stored value reds exactly the two UPDATE-branch tests. Both mutations were reverted; `git diff` confirms the shipped source is the fixed version.

- **Verification run:** `./node_modules/.bin/vitest run` → 57 files / 414 tests passing. `./node_modules/.bin/tsc --noEmit` → clean. (Baseline handed to this task was 56/403; the delta is the 9 tests added here plus 2 files/tests already present on the parent branch beyond that baseline.)

### Potential concerns to address:

- **`SignModal.tsx` needs no change but should be re-read by whoever owns it.** It forwards `res.referred ?? false` and `res.channel ?? null` straight to the analytics event, so it picks up the corrected semantics for free. But any dashboard or query that currently assumes `referred` and `channel` move together will now see `referred:false, channel:"linkedin"` rows. That is the correct data, not a bug — it just wants saying out loud wherever the funnel is defined.
- **Historical events are still wrong** and cannot be repaired from the client. Any `signature_completed` fired before this change may claim `referred:true` for a signer whose row says otherwise. Reconciliation against `countReferralsBySigner` should treat the change date as a cut-over.
- **`createSignerFromModal` calls `readReferralAttribution()` inline** (`referredBySignerId: (await readReferralAttribution()).ref`) and discards the returned attribution entirely. Harmless today because it reports nothing to analytics, but if it ever grows a `referred` field it must read it off the upsert result, not the cookie — the same trap.
- **The UPDATE branch's reported value depends on `select()` returning every column.** If that ever narrows to a projection, `existing[0].referredBySignerId` silently becomes `undefined` and coerces to `null` — reporting "not referred" for someone who is. The two UPDATE-branch tests in `profile.attribution.test.ts` would catch it, so this is a note for anyone tempted to "optimise" that select rather than an open defect.

---
