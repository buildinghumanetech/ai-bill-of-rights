# Branch Progress: sparkle/agent-0f1d4d02-0724-494b-b81b-0c7e20d30a3c

## Progress Update as of 2026-07-26 22:45 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Merged ten worker branches across two batches. The headline is a **confirmed security fix**: every core function in `src/server/actions/*.ts` was a live unauthenticated POST endpoint, including `deleteSigner`, whose only meaningful argument is a signer id — and signer ids are published by design in every `?ref=` share link. Also retired the schema-drift class, completed the deletion cascade across all 15 FKs, and closed the remaining attribution gaps. 67 files / 588 tests passing, tsc clean.

### Detail of changes made:

**SECURITY — unauthenticated server actions (worker `65772b6a`).** Next 16's installed docs state it twice (`node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md`): a file-level `"use server"` directive "marks all exports of that file" as Server Functions, and "Server Functions are reachable via direct POST requests, not just through your application's UI." Every file in `src/server/actions/` began with that directive and exported BOTH the authenticated `*Action` wrapper AND the raw core function it wrapped. The core functions were therefore public RPC. Worst case: `deleteSigner(dbClient = null, signerId)` did `db = dbClient ?? getDb()`, so a POST of `[null, "<signer-uuid>"]` ran the full irreversible cascade against production — and the cascade had just been widened to destroy the target's comments, votes, endorsements, proposals and selfies plus other people's comments on their proposals. About 20 other core functions were exposed the same way (`upsertSignerProfile`, `recordSignature`, `createComment`/`deleteComment`/`editComment`, `voteOnComment`, `approveSelfie`/`rejectSelfie`, `approveAttestation`, `insertNonSigner`, …). Pre-existing, but this branch's cascade work is what made it catastrophic rather than merely wrong. Fixed by moving every core function into plain, non-`"use server"` modules under `src/server/<domain>/` (`signers/delete.ts`, `profile/upsert.ts`, `signatures/record.ts`, `comments/{core,votes,reports,upvotes}.ts`, `selfies/core.ts`, `attestations/core.ts`, `admin/non-signers.ts`); the action files now export only authenticated wrappers (`revoke.ts` is down to one export).
- **`tests/server/actions.guarded.test.ts` is what keeps it fixed.** It parses every action file's exports and fails, naming the export, if any is reachable without an auth guard, with an error message that tells the next developer to move the function rather than add an allowlist entry. **I mutation-verified it myself** rather than trusting the report: appending an unguarded `nukeEverything` export to `revoke.ts` reds it with `src/server/actions/revoke.ts exports \`nukeEverything\` with no auth check reachable from its body`. Removed afterwards.
- Also fixed the consent problem this created: `SignModal`'s "Remove my signature" dialog still read "This deletes your signer record and is irreversible" while the button now destroys the person's whole content history, and `me.ts`'s docstring said the same. Both now enumerate what is actually erased.

**Schema drift retired (worker `c85ecd09`).** `createTestDb` now GENERATES its DDL from `src/lib/db/schema.ts` via drizzle-kit's programmatic `generateMigration`, replacing ~200 lines of hand-written mirror. Verified the payoff directly: deleting `onDelete: "set null"` from `schema.ts` now reds **6 tests**, where before it changed nothing at all. Diffing the two catalogs surfaced nine real divergences — most importantly four partial indexes that existed ONLY in the test DDL, so `drizzle-kit push` would have silently dropped them from production, including `selfies_signer_active_unique`, the spec's sole DB-level "one active selfie per signer" guarantee. Those are now declared in `schema.ts`. Seven CHECK constraints and two composite PKs existed only in the test DDL and were dropped, because `text(col, {enum})` is a TypeScript-level constraint that drizzle-kit never emits — production never had them.

**Deletion cascade completed (worker `3be25e80`).** Extended to all 15 FKs into `signers.id`, covering both rows authored BY the signer and rows others attached to what they authored. Moderation-decision columns (`proposed_edits.decided_by`, `comment_reports.resolved_by`, `selfies.reviewed_by`) are NULLed rather than cascaded, so erasing a moderator does not erase the community's history. `me.ts` and `admin.ts` now delegate to the single cascade instead of keeping drifting partial copies — three implementations of one cascade was the root cause. The worker mutation-verified all 12 cascade statements individually, 11 producing a genuine 23503 naming the constraint. It also corrected my brief: `attestations` has no FK to `signers.id` at all (it is claimed by contact_email), and pinned that with a test so a future `claimed_by_signer_id` cannot silently reintroduce the bug.

**Attribution and analytics honesty (workers `277f0a65`, `32c38ff1`, `55904b46`).** `referred` now reports what was actually persisted rather than what the cookie claimed, so the funnel can be reconciled against `countReferralsBySigner`. The confirmation email's two self-directed links no longer carry the signer's own `?ref=`, which was burning their 30-day first-touch slot on their own click. The invite email — the highest-intent surface on the site — was completely untagged, so personally-invited signers were attributed to nobody; it now routes through `signerShareUrl`/`homeShareUrl`. A third copy of the X/LinkedIn/mailto construction in `ShareSignature.tsx` had already drifted (no `&url=` param, so X rendered no link card; a different mailto subject) and now routes through the shared `shareHrefs` builder.

**"Why I signed" (workers `1e8bdacc`, `8eb0074b`).** Real clamp test, single source of truth for the cap, edit/remove path on the account page, X weighted-length margin, and a client-bundle split. Then: **removing your statement was itself rate-limited**, so someone who regretted what they wrote could not take it down for up to an hour while it stayed live on their public page and OG card — the limiter now applies only to the SET path, which bounds the abuse loop just as tightly. The signer page also bypassed `normalizeWhyISigned` with a bare `.trim()`, so HTML and the OG card could disagree about what a person said.

### Verification
- `./node_modules/.bin/vitest run` — **67 files / 588 tests, all passing** (from 49 / 336 at the start of the day).
- `./node_modules/.bin/tsc --noEmit` — clean.
- Independently mutation-verified: the actions guard test, the schema drift guard, and the FK fix.

### Potential concerns to address:
- **This has not been deployed yet.** The unauthenticated-endpoint fix is on the branch, not in production. Until it lands, `deleteSigner` remains POST-reachable in prod with a public id.
- **Four separate tests shipped on this branch that could not fail** — the OG clamp asserting Satori's constant canvas size, the FK tests that never touched `schema.ts`, the root-layout test that mocked the module it was testing, and the OG test that called a helper in the test process and asserted on that rather than on the route's output. Every worker task now carries a mandatory mutation-verification step, which is catching them, but the pattern is worth watching in review.
- **Deleting a proposer still deletes other people's comments on their proposal**, because `proposed_edits.proposer_signer_id` is NOT NULL. The clean fix is a tombstone signer to reassign orphaned content to — a product and schema decision, deliberately left alone.
- **The rate limiter is per-process**, so on serverless the effective budget is per-instance and a cold start resets it. The docstring is now honest about this rather than claiming adequacy.
- The orchestrator lost three more workers to the stall-after-finishing pattern this round; their work was salvaged by committing in their own worktrees. Worker `65772b6a` also never wrote its own progress log, which is why its work is documented here instead.

---

## Progress Update as of 2026-07-26 14:15 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Merged the three roborev-fix workers (FK/deletion, analytics wiring, signer-page polish) — 56 files / 403 tests green. Then mutation-tested the headline FK fix and found the new deletion tests **cannot** catch a regression in `src/lib/db/schema.ts`, which is the file that actually ships; added a drift guard for that. Also empirically confirmed a roborev finding that account deletion is **still** broken for signers with other activity.

### Detail of changes made:
- Merged `5becbfd6` (`ON DELETE SET NULL` on `referred_by_signer_id`, referral capture moved ahead of `auth.protect()` in `src/proxy.ts`, ref/channel cookies now always rewritten as a pair), `4e21315a` (mounts `<SiteAnalytics />`, wires the five previously-dead funnel helpers to real call sites, tags confirmation-email share links, reads the `via` cookie at signing time), and `2dafcf23` (`gist()` now reuses the exported `splitSentences`, signer-page pull quote clamped to four lines so the CTA stays above the fold). All three fast-forwarded or merged clean — no conflicts.
- **Added `tests/lib/db.referral-fk-drift.test.ts`.** There are two descriptions of the signers table: `src/lib/db/schema.ts` (what `drizzle-kit push` applies to Neon) and the hand-written DDL in `tests/_helpers/pglite-db.ts` (what tests run against). Deleting `onDelete: "set null"` from schema.ts alone left the entire 403-test suite green — including the six new deletion tests written specifically to prove that fix. The guard reads the table's foreign-key metadata via drizzle's `getTableConfig` and asserts `onDelete === "set null"`, plus asserts the test DDL still mirrors the clause so drift in either direction is caught.
- Verified both directions by mutation: removing `on delete set null` from the *test* DDL reds 5 of the 6 deletion tests with a real FK violation (so those tests are meaningful), and removing `onDelete` from *schema.ts* reds the new guard (and nothing else). Source restored; `git diff src/` empty.

### Roborev triage (jobs 53, 48, 52)
- **MEDIUM (job 53) — account deletion is still broken for signers with other activity: CONFIRMED empirically.** `referredBySignerId` is the only one of 15 foreign keys to `signers.id` that has an `ON DELETE` action; the other 14 are bare `.references(() => signers.id)`, i.e. `NO ACTION`. `deleteSigner` (`src/server/actions/revoke.ts`) manually cascades selfies, selfie reports, the legacy Phase 3 tables, signatures and consent records — but not `endorsements`, `comment_votes`, `comment_reports`, `comment_mentions`, `proposal_upvotes`, `proposed_edits` or `attestations`. A throwaway pglite proof showed a signer with an endorsement fails with `endorsements_signer_id_fkey`, and a signer with a comment vote fails with `comment_votes_comment_id_fkey`. GDPR erasure therefore still fails, on all three deletion paths, for anyone who has endorsed a version or voted on a comment. Dispatched as its own fix.
- **MEDIUM (job 48) — the reported `referred` flag can disagree with what was persisted: real.** `sign-from-modal.ts` derives `referred` from the raw cookie, but `resolveReferrerId` drops a ref whose referrer has since deleted their account. So analytics can report `signature_completed{referred:true}` against a null `referred_by_signer_id`, and the two ends of the funnel can never be reconciled. Dispatched.
- **LOW (job 48) — the confirmation email self-refs: real and worse than it looks.** "View your public signature page" carries the signer's own id as `?ref=`, so clicking your own email stamps a self-ref cookie. The DB rejects self-referral, but the cookie is first-touch for 30 days — so it occupies the slot a genuine later referral would have used. That is an own-goal against the exact viral loop this work exists to build. Dispatched.
- **MEDIUM (job 48) — none of the new call-site wiring is covered.** Every new test covers a pure function; nothing pins that `<SiteAnalytics />` is mounted or that `signature_completed` fires from both modal success paths. Deleting any of the five new call sites reproduces the original bug with a green suite. Dispatched (needs a jsdom environment).
- **MEDIUM (job 53) — the `0008` migration is not registered in `drizzle/meta/_journal.json`**, so `drizzle-kit migrate` will never apply it, while the file's header claims it will. Deploys use `push`, so impact is limited to the file's own honesty; dispatched as a docs/mechanism fix.
- **MEDIUM (job 52) — `gist()` is tested as a function but nothing asserts it reaches the HTML.** Dispatched, along with the clamped pull quote losing its closing quotation mark.
- Smaller items dispatched with the above: the vacuous `not.toContain` assertion at `tests/lib/referral.cookie.test.ts:71`, the `expectInviterGone(inviteeId)` misnaming, the `Module._load` patch installed at import time rather than in `beforeAll`, `trackShareLinkLanded` filling a missing channel with `"unknown"` while `trackSignatureCompleted` strips it, `share_clicked{channel:"copy"}` firing before the clipboard write is awaited, and the X/LinkedIn/mailto href construction now duplicated verbatim between `SignModal.tsx` and `email/templates.ts`.

### Verification
- `./node_modules/.bin/vitest run` — **56 files / 403 tests, all passing** (up from 49 / 336).
- `./node_modules/.bin/tsc --noEmit` — clean.

### Potential concerns to address:
- **Account deletion is still broken in production** for signers with an endorsement or a comment vote. The `ON DELETE SET NULL` fix closed only the referral column.
- **`schema.ts` and `tests/_helpers/pglite-db.ts` are two hand-maintained copies of the same schema.** The new drift guard covers exactly one clause on one column. Every other divergence between them is still invisible to the suite, and `drizzle-kit push` will happily drop anything not declared in `schema.ts`.
- Worker `9a9ae884` (the "why I signed" hardening task) **never started** — no commit, no result file, nothing touched in 29 hours. Its task has been respawned; the underlying orchestrator bug (spawns silently retrying, and `wait_for_workers` dying after 1800s of silence) has now cost time three times today.

---

## Progress Update as of 2026-07-25 08:45 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Merged the last three growth workers (signer landing page, "why I signed", attribution + analytics), cleared the apparent test-suite hang as machine contention rather than a defect, and wrote the attribution tests the third worker never produced. Then read all three roborev reviews and **empirically confirmed a HIGH-severity data bug**: the new self-referencing foreign key has no `ON DELETE` action, so deleting a signer who successfully referred anyone now fails with SQLSTATE 23503 — account deletion / GDPR erasure breaks for exactly the most successful sharers.

### Detail of changes made:
- Merged `708649ab` (signer page -> stranger-facing landing page), `26be1b86` ("why I signed" statement, sanitiser, share copy, OG card), and `22a30a50` (ref/via cookies in `src/proxy.ts`, `resolveReferrerId`, referral queries, analytics wrapper). All three had stalled after writing code, so their work was staged and committed in their own worktrees before merging.
- **The "hanging test suite" was not a defect.** A full `vitest run` had timed out at 10 minutes right after the merges. Re-run serially it passes in 186s (47 files / 313 tests) and in default parallel mode in 53s. The timeout happened while `corepack pnpm install` and eight worker agents were competing for the same cores. No code change was needed; recording it here so a future session doesn't go hunting for a phantom deadlock.
- **Wrote the missing attribution tests** (worker `22a30a50` shipped none, which roborev job 33 also flagged). Added `tests/lib/referral.cookie.test.ts` (14 pure tests over `referralCookiesToSet`) and `tests/server/profile.attribution.test.ts` (9 pglite tests through `upsertSignerProfile`). They pin: first-ref-wins, an already-attributed visitor being off-limits entirely, malformed refs and unknown channels being dropped rather than stored, a corrupted existing cookie not permanently locking someone out of attribution, cookie flags (`httpOnly`/`lax`/`/`/30d), attribution written on INSERT and never rewritten by a later profile edit, and — the important ones — a stale or malformed ref still producing a *successful* signature rather than a foreign-key explosion.
- **Verified those tests actually fail on the behaviour they guard**, rather than trusting a green run. Mutating `referralCookiesToSet` to drop the `!alreadyAttributed` condition reds the first-ref-wins test; bypassing `resolveReferrerId` in `upsertSignerProfile` and passing the raw cookie straight to the INSERT reds both "still signs the person" tests with a real FK violation. That proves the resolver is load-bearing rather than decorative. Source was restored afterwards (`git diff src/` empty).

### Roborev triage (jobs 31, 32, 33)
Three reviews, one per merged worker. The consequential findings, and what I did with them:
- **HIGH (job 33) — `referred_by_signer_id` has no `ON DELETE` action: CONFIRMED, real, not yet fixed.** I proved it directly against pglite: insert inviter, insert invitee referencing them, `DELETE FROM signers WHERE id = inviter` returns **SQLSTATE 23503**. None of the three deletion paths (`me.ts:110` self-service delete, `revoke.ts:120`, `admin.ts:83`) clear the referring column first. This commit is what starts populating that column, so the breakage begins now. Dispatched as the first fix.
- **MEDIUM (job 33) — the analytics layer measures nothing: CONFIRMED.** `grep` shows `<Analytics />` is never mounted in `src/app/layout.tsx` and `src/lib/analytics/*` has **zero call sites** anywhere in `src/`. `@vercel/analytics`'s `track()` is a no-op without the script injected, so the dependency and its 165 lines currently produce no data at all. This defeats the entire point of the "unlocks measurement" item.
- **MEDIUM (jobs 31 + 32) — most share surfaces still untagged: CONFIRMED.** `signConfirmation` gained `signerId`/`whyISigned` params but neither call site passes them, so confirmation-email share links carry `?via=` with no `?ref=`. The post-signature share step in `SignModal` still hand-builds X/LinkedIn/mailto URLs with no attribution at all. Since that modal and that email are the two highest-volume surfaces, current channel numbers would read as "email and X barely convert" purely as an artifact of which links got tagged.
- **MEDIUM (job 32) — the OG clamp test cannot fail.** Satori always emits a 1200x630 canvas, so asserting those dimensions is content-independent and would hold identically with the sanitiser removed.
- **MEDIUM (job 33) — no referral tests: ALREADY FIXED** by the two files above, which is the exact split the finding asked for.
- **LOW (job 33) — the self-referral guard is structurally unreachable.** Correct: `resolveReferrerId` runs only on the INSERT branch, which by definition means no row exists for that `clerkUserId`, so the fetched referrer can never match. My test has to call the resolver directly to exercise it. Keeping the guard as cheap defence-in-depth, but the docstring needs to stop advertising protection that cannot fire on the current call path.

### Verification
- `./node_modules/.bin/vitest run` — **49 files / 336 tests, all passing**.
- `./node_modules/.bin/tsc --noEmit` — clean.
- FK bug reproduced in an isolated pglite test printing `DELETE RESULT CODE: 23503`.

### Potential concerns to address:
- **The FK bug is live until the fix lands.** Any signer who has referred someone cannot currently delete their account.
- `eslint .` reports 167 `no-explicit-any` errors across ~44 files, but this is a long-standing project-wide convention (`db: any` appears 85 times in `src`/`scripts` on `main` alone), not something these merges introduced. Worth a dedicated cleanup, not a blocker here.
- The `via` channel cookie is written but never read — `readChannelCookieValue` has no callers — so "which surface converts" stays unanswerable until the analytics wiring lands.
- "Why I signed" is write-once with no edit or removal path, no rate limit, and no admin takedown, while rendering publicly on a page and an OG card.

---

## Progress Update as of 2026-07-24 21:25 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Merged the scorecard-mechanism worker and verified its safety constraint by hand. Then triaged roborev job 10, which caught a **regression I introduced in my own previous fix**: rewriting `withShareParams` to use `URLSearchParams` silently form-encoded unrelated query params, which corrupts `mailto:` share links. Fixed that, and tightened the ref semantics and the DB test assertions.

### Detail of changes made:
- Merged `sparkle/agent-5d141524-51fe-4c0c-9e8d-b4e8fdcabe59` (scorecard mechanism). Adds `src/lib/scorecard/` (parser/validator/loader), `/scorecard` + `/scorecard/[slug]` pages, OG cards, and `content/scorecard/` with a README and one entry.
- **Independently verified the scorecard safety constraint** rather than trusting the worker's claim: grepped all committed scorecard content, source, and tests for real AI company names — clean (the only regex hits were `generateMetadata`/`toMatchObject`). The one committed entry is `Example AI Labs`, marked `fictional: true`, with every URL on `example.com` and every assessment paragraph self-labelled "(Fictional.)".
- **Verified the citation rule is a hard failure, not a claim.** Exercised the validator directly: a `falls-short` verdict with no citations, with `citations: []`, with a citation missing `url`, missing `checkedOn`, or with a non-http URL are all rejected. The error text is genuinely good — *"status 'falls-short' is a public claim about a company and requires at least one citation"*. A required `fictional` field forces every author to state plainly whether an entry is real.
- Confirmed both scorecard pages set `robots: { index: false, follow: false }` and that nothing in the layout, homepage, or components links to them — reachable by URL only, as intended, until the owner decides to publish. Rendered the scorecard OG card (200, `image/png`, 57,913 bytes) and inspected it; it correctly reports **0 companies / 0 assessments**, because `page.tsx` and the OG route both filter `!e.fictional` so demo content can never inflate a public count.
- **Fixed (regression, mine): `withShareParams` corrupted unrelated query params.** My previous fix parsed the whole query into `URLSearchParams` and re-serialised it, which applies form-encoding to params the caller never asked to touch: `?title=Hello%20World` came back as `Hello+World`, and `~` became `%7E`. Verified empirically. The sharp case is `mailto:` — RFC 6068 reads `+` as a literal plus, so a shared mail draft would have arrived reading "I+just+signed". Rewrote it to split the query on `&` and drop only the `ref`/`via` pairs, leaving every other pair byte-identical. Regression tests pin `%20`, `~`, and a full mailto body.
- **Fixed: ambiguous ref semantics.** Previously an absent ref and an invalid ref were indistinguishable, and both left an existing `ref=A` in place — so a caller saying "attribute this to B" with a broken B would ship a link crediting A for a share A never made, labelled with B's channel. Semantics are now keyed on whether the caller *mentions* the key: absent → leave untouched (no opinion expressed); valid → replace; present-but-invalid, or explicit `null` → remove. Docstring rewritten to describe what happens to the *incoming* URL.
- **Fixed: the FK test would have stayed green with no FK.** It asserted only `.rejects.toThrow()`, which also passes on a renamed column, a NOT NULL violation, or a pglite connection failure. Now asserts SQLSTATE `23503` (foreign_key_violation) specifically.
- **Fixed: test DDL missing the index.** Added `create index signers_referred_by_idx` to `tests/_helpers/pglite-db.ts`, so the helper matches `schema.ts` on the exact artifact the previous commit fixed.

### Roborev triage (job 10, commit 61cfc20)
- High — `ARTICLES` exported from a route file breaks `next build`: **rejected as a false positive, again.** This is the same carry-over claim from job 9. I had already disproved it with a real `next build` under Next 16.2.6 (TypeScript ran, build succeeded) and had already moved the constant to `src/app/api/og/articles.ts` in `3754b22` for test-isolation reasons. The reviewer flagged it as "still unaddressed" because it re-reviewed the parent commit.
- Low — `URLSearchParams` re-encoding: **fixed**, see above. Correct and valuable finding.
- Low — ref semantics on invalid input: **fixed**, see above. Correct.
- Low — weak FK assertion + missing index in test DDL: **fixed**, see above. Correct.

### Verification
- `./node_modules/.bin/vitest run` — **45 files / 298 tests, all passing**.
- `./node_modules/.bin/tsc --noEmit` — clean. `eslint` on changed files — clean.
- Scorecard validator exercised by hand across 6 malformed-input cases; all rejected with actionable messages.

### Potential concerns to address:
- The share-link semantics are now precise but subtle (absent vs invalid vs null). Every call site added during the pending call-site migration should be checked against them — in particular anything building a `mailto:` link, which is the case the encoding bug would have hit.
- The scorecard is deliberately unlinked and `noindex`. Publishing it is a separate, deliberate act: add navigation and flip `robots`.
- Two of three roborev reviews so far have led with a High finding that did not survive verification. The Low findings, by contrast, have been consistently accurate and worth acting on.

---

## Progress Update as of 2026-07-24 21:00 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Merged the signature-count reframing worker, then triaged roborev's review of the drift-guard commit. **The review's single High finding turned out to be wrong** — I verified it empirically with a real `next build` rather than taking it at face value. Kept the suggested refactor anyway on its own merits, and fixed the three Low findings, which were correct.

### Detail of changes made:
- Merged `sparkle/agent-4fa714f9-a0c1-4a89-ac89-98f02c46f78c` (count reframing; recursive merge, no conflicts). It adds `src/components/SignatureMomentum.tsx` with a pure `getSignatureFraming(count)` decision function and a `RAW_COUNT_THRESHOLD` (default **5000**, overridable via `NEXT_PUBLIC_SIGNATURE_COUNT_THRESHOLD`). Below the threshold the homepage/floating-CTA copy becomes cohort framing ("Be signer #91 of the first 1,000", progress bar, recently-signed chips); at or above it, the copy flips automatically back to the plain large-number form. 16 new tests cover both sides of the threshold including the boundary.
- **Roborev High finding — INVESTIGATED AND REJECTED.** Job 9 claimed that `export const ARTICLES` in `src/app/api/og/route.tsx` would fail `next build`, because Next's route-type generator emits `checkFields<Diff<...>>` requiring every non-handler export to be `never`. The mechanism it described is real (confirmed in `node_modules/next/dist/build/webpack/plugins/next-types-plugin/index.js`), but the conclusion is not: I re-added the offending export and ran a full `next build` under Next 16.2.6/Turbopack. TypeScript ran (`Running TypeScript ... Finished TypeScript in 8.9s`) and the build **succeeded**. The finding is a false positive for this version/config. Recording it here so nobody re-derives it from the review later.
- **Kept the refactor regardless**, for a different and real reason: `src/app/api/og/articles.ts` (new) now holds `ARTICLES`, so the drift test imports nine plain strings instead of transitively loading `next/og`'s `ImageResponse` runtime and `@/lib/db/queries` just to read them. `route.tsx` imports from it. This is a test-isolation win, not a build fix — it should not be described as one.
- **Fixed (Low): the drift test threw a `TypeError` on the exact drift it exists to catch.** The word-overlap test indexed `headings[i]` positionally; when an article is *removed*, `headings[i]` is `undefined` and `stems(undefined)` threw `Cannot read properties of undefined` instead of the carefully-worded failure. Added a length gate inside that test (the sibling `it` doesn't gate it). Verified by deleting Article 9 from the markdown: now fails with `Article count changed; update ARTICLES in src/app/api/og/articles.ts` and no TypeError.
- **Fixed (Low): silent empty parse.** `articleHeadings()` returned `[]` for any markdown deviating from `## Article N:` form, which would let the comparison test pass vacuously over zero iterations. It now throws, naming the file and the regex as the likely culprit.
- **Fixed (Low): nothing pinned article ordering.** Added a test asserting the parsed article numbers are exactly `1..N` in document order — a cheap exact check that catches renumbering/reordering without depending on the fuzzy word-overlap heuristic.
- Deduplicated the long rationale that was written twice (once by `ARTICLES`, once in the test docstring); the full version now lives only in `articles.ts` with a one-line pointer from the test.

### Verification
- `./node_modules/.bin/vitest run` — **42 files / 241 tests, all passing**.
- `./node_modules/.bin/tsc --noEmit` — clean.
- `./node_modules/.bin/next build` — compiles, TypeScript passes. (Static generation logs Neon connection errors because there is no reachable DB in this worktree; that is environmental, and the pages degrade as designed rather than failing the build.)
- Drift guard re-verified in both directions: green on the real document, red with an actionable message when an article is rewritten AND when one is removed.

### Potential concerns to address:
- Roborev job 6 (commit `c3766c5`, the merged homepage-OG work) still shows status `failed` with no review output, so that commit has no automated review coverage — it was reviewed by hand instead.
- The count reframing reads `NEXT_PUBLIC_SIGNATURE_COUNT_THRESHOLD` at module load. Being `NEXT_PUBLIC_`, it is inlined at build time, so changing the threshold requires a redeploy, not just an env edit. That is documented in the file but worth knowing operationally.
- Two independent notions of "when is the count big enough" now exist: `RAW_COUNT_THRESHOLD` (5000) in `SignatureMomentum.tsx` and a hard-coded `1000` in `ctaLine()` in the OG route. They are deliberately different numbers for different surfaces, but they are not linked — a future change to one will not move the other.

---

## Progress Update as of 2026-07-24 20:50 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Triaged the roborev review of the groundwork commit (`8ce06b6`) and fixed the two Medium findings, both of which were real bugs in my own code that would have silently broken referral attribution in production. Also closed the Low finding about missing DB-level test coverage for the new columns.

### Detail of changes made:
- **Fixed (Medium): `signers_referred_by_idx` would have been silently dropped.** The index was declared only in `drizzle/0007_...sql`, not in `schema.ts`. Per the README the deploy path is `drizzle-kit push`, which reconciles the database against `schema.ts` and drops indexes it doesn't know about — so the index would have vanished on the next push, exactly when the referral queries start running. Converted `signers` from the object-only `pgTable` form to the array-extras form (matching the existing precedent on `versions`, `signatures`, `selfies`) and declared `index("signers_referred_by_idx").on(t.referredBySignerId)` there, with a comment explaining why it must live in this file.
- **Fixed (Medium): `withShareParams` stacked attribution params instead of replacing them.** The old implementation appended by string concatenation without checking for existing params. A signer who landed on `/?ref=A&via=x`, copied the address bar and re-shared it would produce `?ref=A&via=x&ref=B&via=copy`. Because `parseRef`/`parseChannel` read the **first** value, B's attribution was silently discarded and A credited twice — the precise failure the module exists to prevent. Rewrote it to parse into `URLSearchParams` and use `.set()`, which overwrites every existing occurrence. Unrelated query params and the fragment are preserved.
- `tests/lib/share-urls.test.ts`: +5 regression tests for the stacking bug — replacing an existing ref, replacing an existing channel, re-attributing a fully-attributed URL, preserving unrelated params while replacing attribution, and (deliberately) leaving existing attribution intact when the *new* ref is invalid, so a malformed id strips nothing.
- `tests/lib/db.signers-referral-columns.test.ts` (new, 7 tests): closes the Low finding that no test exercised either new column. Round-trips `why_i_signed` (including unicode/emoji), asserts both columns default to null, and — most importantly — **pins the self-FK by asserting a nonexistent referrer id is rejected**. That rejection is the behaviour the attribution write path has to tolerate without failing the signature itself.

### Roborev triage (job 5, commit 8ce06b6)
- Medium — index dropped by `db:push`: **fixed**, see above.
- Medium — `withShareParams` stacking: **fixed**, see above.
- Low — nothing imports the share helpers yet: **accepted as staged groundwork**, not a defect. Call-site migration is in flight in the parallel workers (`SignModal.tsx`, `ShareSignature.tsx`, `invite.ts`, `sign.ts`). Worth re-checking at integration that no hand-rolled share URL survives.
- Low — no DB-level test for the new columns: **fixed**, see above.
- Low — `why_i_signed` unbounded at the DB level: **deferred by design**. The ~200-char cap is being enforced server-side by the "why I signed" worker; that is the right layer since the text also needs trimming/sanitising. To verify at integration.
- Note: roborev job 6 (the merged worker's commit `c3766c5`) came back with status `failed` after 3s and produced no review output, so that commit has **no automated review coverage**. Its content was reviewed by hand instead (see the 20:45 entry).

### Verification
- `./node_modules/.bin/vitest run` — **41 files / 224 tests, all passing** (was 40/212 before this change; +12 from the new regression and DB tests).
- `./node_modules/.bin/tsc --noEmit` — clean.
- `./node_modules/.bin/eslint` on the changed files — clean.

### Potential concerns to address:
- `drizzle/meta/` snapshots still stop at `0001`, so the generated-migration history and the actual schema have long since diverged; `db:push` is the real deploy path. The index fix above is a direct consequence of that divergence, and the same class of bug will recur for any future index declared only in SQL.
- The self-FK on `referred_by_signer_id` is enforced at the DB level (now tested). Any code writing attribution must catch the rejection rather than letting it propagate — a stale cookie must never be able to fail a signature.

---

## Progress Update as of 2026-07-24 20:45 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Merged the homepage-OG worker branch (`sparkle/agent-b6dfc78b-...`), which fixed the site's biggest share leak: the homepage served zero Open Graph tags. On review of that merge I found the nine article short-forms on the new OG card are hand-written paraphrases rather than derived from the document, which is a silent-drift risk on a living versioned document — so I added a tripwire test and documented the coupling.

### Detail of changes made:
- Merged `sparkle/agent-b6dfc78b-6e58-4074-a321-61d765b7f8db` (fast-forward, no conflicts). It added `metadataBase` + a full `openGraph`/`twitter` block to the root metadata export in `src/app/layout.tsx`, a new dynamic card at `src/app/api/og/route.tsx`, a README domain correction (`aibillofrights.org` -> `ai-for-people.org`), and 7 tests.
- **Verified the merge independently rather than trusting the worker's report**: rendered the OG route to a PNG (200, `image/png`, 66,748 bytes) and visually inspected it. Banner/3x3 article grid/amber CTA footer all render correctly; the CTA reads "Be one of the first 1,000 to sign" rather than printing the raw count of ~90, which was the framing constraint.
- **Found on review:** the nine article titles on the card (`ARTICLES` in `src/app/api/og/route.tsx`) are hand-written short forms, NOT loaded from `content/bill-of-rights/`. They are faithful paraphrases of the v0.0.1 headings (the real headings — e.g. "You Have the Right to Know You're Talking to a Machine" — are far too long for a 3x3 grid on a 1200x630 card, so paraphrasing is the right call). But the Bill of Rights is explicitly a *living, versioned* document, so an edit to the markdown would leave the share card silently misrepresenting it to every social feed, with nothing to catch it.
- `src/app/api/og/route.tsx`: exported `ARTICLES` and replaced the one-line comment with an explanation of why the list is hand-written, why that is a drift risk, and which test guards it.
- `tests/app/og-articles-drift.test.ts` (new): parses `versions.json` for the current version, extracts the `## Article N:` headings from that version's markdown, and asserts (a) `ARTICLES` has one entry per article, (b) there are exactly nine, since the 3x3 grid layout depends on it, and (c) each short form still shares a distinctive stem with the heading in the same position — so a reorder or a substantive rewrite trips it. Stop-word filtered and stem-compared at 6 chars so inflections ("manipulation" vs "Manipulated") don't false-positive.
- **Proved the guard actually fails on drift** rather than being a test that can never go red: temporarily rewrote Article 7 to "Weather Forecasting Standards", confirmed the test failed with an actionable message naming the file to update, then restored the content file and confirmed green.

### Verification
- `./node_modules/.bin/vitest run` — **40 files / 212 tests, all passing** (up from 37/202 at branch start; +7 from the merged worker, +3 from the drift guard).
- `./node_modules/.bin/tsc --noEmit` — clean.
- Homepage OG card rendered and visually inspected at 66,748 bytes.

### Potential concerns to address:
- The OG card's article short-forms remain a manual mirror of the document. The new test catches drift but cannot fix it — when it goes red, a human must rewrite the short forms. That is the intended trade-off (mechanical shortening of those headings would read badly), but it is a maintenance obligation worth knowing about.
- `content/bill-of-rights/v0.0.1.spec.json` declares only **1** principle while the markdown has **9** articles. The spec file appears incomplete/stale. Nothing in this change depends on it (the drift test reads the markdown), but anything that trusts `spec.json` as the machine-readable source of the nine principles — including the "implement as code" surface advertised in the README — would be wrong today.
- The current published version is **0.0.1**, not the `1.0.0` referenced in the README's curl example.

---

## Progress Update as of 2026-07-24 20:15 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Opened a viral-growth workstream on the signature funnel. This first commit lays the shared groundwork that several parallel workstreams all depend on — two new `signers` columns (`why_i_signed`, `referred_by_signer_id`) and a canonical share-URL builder at `src/lib/share/urls.ts` — so that the follow-on work (homepage OG cards, referral attribution, "why I signed", signer-page redesign) can proceed in parallel without colliding on the same files.

### Detail of changes made:
- **Diagnosis that motivated this work.** Verified against production: `https://ai-for-people.org/` serves **zero** Open Graph / Twitter meta tags (`src/app/layout.tsx` sets only `title` + `description`, no `openGraph`, no `metadataBase`). Every share of the homepage — the URL people actually copy, and the one `signInvitation` emails point at — unfurls as a bare link with no image. Per-signer pages (`/signatories/[id]`) *do* unfurl correctly; the `og:image` resolves and returns a 1200x630 PNG. Live signature count is 90 (`/api/signers/recent`), and that number is surfaced in four places, where at this scale it reads as counter-proof rather than social proof. There is no analytics package in `package.json` and no referral attribution in the schema, so share→signature conversion is currently unmeasurable.
- `src/lib/db/schema.ts`: Added two columns to `signers`. `whyISigned` (`why_i_signed`, nullable text) holds an optional short statement captured at signing time — it feeds the signer's public page, their OG share card, and the default share text. `referredBySignerId` (`referred_by_signer_id`, nullable uuid) is a **self-referencing FK** to `signers.id` recording which signer's share link brought this person in; the self-reference requires the `AnyPgColumn` return-type annotation (already imported at the top of the file) to break the circular type reference.
- `drizzle/0007_why_i_signed_and_referrals.sql`: Hand-written migration adding both columns. Uses `ADD COLUMN IF NOT EXISTS` and wraps the FK constraint in a `DO $$ ... EXCEPTION WHEN duplicate_object` block so the migration is safely re-runnable against a database where `db:push` has already applied the schema. Adds `signers_referred_by_idx` on the new FK column, since the natural query ("how many people did signer X bring in?") filters on it.
- `tests/_helpers/pglite-db.ts`: Added the two new columns to the raw `create table signers` DDL. This helper mirrors what drizzle-kit would generate and is what the whole vitest suite runs against — **it must be updated by hand whenever `schema.ts` changes**, or every DB-touching test breaks.
- `src/lib/share/urls.ts` (new): Single source of truth for outbound share links. Every share URL now carries `?ref=<signerId>` (who shared it) and `?via=<channel>` (which surface it came from — `x`, `linkedin`, `email`, `copy`, `qr`, `invite`, `confirmation-email`). Exports `withShareParams`, `signerShareUrl`, `homeShareUrl`, `parseRef`, `parseChannel`, plus the `isValidRef` / `isShareChannel` guards. Refs are validated as UUIDs and **silently dropped if malformed**, so a bad id can never propagate into a share link or reach a DB write. `withShareParams` preserves an existing query string (`?` vs `&`) and keeps any URL fragment at the end.
- `tests/lib/share-urls.test.ts` (new): 16 tests covering the query-separator logic, fragment preservation, invalid-ref rejection, trailing-slash normalisation on the site URL, and both the plain-object and `URLSearchParams` shapes that `parseRef`/`parseChannel` accept (Next passes the former from `searchParams`, the latter shows up in client code).

### Verification
- `./node_modules/.bin/vitest run` — **37 files / 202 tests, all passing**.
- `./node_modules/.bin/tsc --noEmit` — clean, exit 0.
- Note: `pnpm` is not on the PATH in this worktree; deps were installed via `corepack pnpm install`, and test/typecheck are run through `./node_modules/.bin/*` directly. `corepack pnpm test` fails because pnpm's own deps-status check re-invokes a bare `pnpm`.

### Potential concerns to address:
- `drizzle/0007` is hand-written rather than generated by `drizzle-kit generate`, so `drizzle/meta/_journal.json` and the snapshot files were **not** updated. The project has been applying schema via `db:push` (per README), so this is consistent with existing practice, but a future `drizzle-kit generate` may produce a duplicate migration for these columns. The `IF NOT EXISTS` guards mean that would be a no-op rather than a failure.
- `referred_by_signer_id` is a self-FK with no `ON DELETE` behaviour specified (`no action`). If signer deletion is ever added (distinct from the current revoke flow, which soft-deletes), rows referencing a deleted signer will block the delete. Revocation today does not hard-delete signer rows, so this is not currently reachable.
- The `why_i_signed` column has no length constraint at the DB level. The UI is expected to cap it (~200 chars); server-side validation must enforce that too rather than relying on the client, since it renders into a public OG image.
- The site's canonical domain is `ai-for-people.org`. `README.md` still refers to `aibillofrights.org`, which is **a different, unrelated site** (a Wix page titled "Global AI Bill of Rights"). The README should be corrected so the wrong domain does not leak into share copy.

---
