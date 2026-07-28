# Branch Progress: sparkle/agent-3be25e80-1186-4529-aaeb-194dfe2a1b89

## Progress Update as of [2026-07-26 20:15 Pacific]
*(Most recent updates at top)*

### Summary of changes since last update

Account deletion / GDPR erasure was still broken for any signer with activity beyond a
referral. `signers.referred_by_signer_id` is the only FK into `signers.id` that carries an
`ON DELETE` action (SET NULL, added in drizzle/0008); the other ~14 are bare
`.references(() => signers.id)`, i.e. NO ACTION, and `deleteSigner` cleared only about half
of them. Anyone who had endorsed a version, voted on or flagged a comment, been @-mentioned,
upvoted a proposal or proposed an edit hit SQLSTATE 23503 on the final `DELETE FROM signers`.
This commit extends `deleteSigner`'s manual cascade to every remaining dependent row, makes
the self-service and admin paths delegate to that one cascade instead of keeping their own
drifting subsets, and adds `tests/server/signer-deletion.activity.test.ts` (17 cases) covering
one activity kind at a time.

### Detail of changes made:

- **`src/server/actions/revoke.ts` — the cascade.** `deleteSigner` now runs, in FK-safe order
  (neon-http has no transactions, so order is the only safety net):
  1. selfie blob deletion (unchanged);
  2. `UPDATE ... SET <col> = NULL` for the four moderation-decision columns —
     `proposed_edits.decided_by`, `comment_reports.resolved_by`, `selfies.reviewed_by`,
     `selfie_reports.resolved_by`;
  3. selfie_reports + selfies (unchanged);
  4. legacy `reports` (still via `tryDeleteLegacy`);
  5. `comment_votes`, `comment_reports`, `comment_mentions`, `comment_upvotes` — each takes
     rows authored by the signer **plus** rows anyone attached to a doomed comment;
  6. `UPDATE comments SET parent_comment_id = NULL` for surviving replies, then
     `DELETE FROM comments WHERE id IN (doomed)`;
  7. `proposal_upvotes` then `proposed_edits`;
  8. `endorsements`;
  9. signatures / consent_records / signers (unchanged).
- **New helper `doomedCommentIds(signerId)`** returns the comment ids that cannot outlive the
  signer: comments they wrote, **plus** every comment on a proposal they authored regardless of
  who wrote it. The second group is deliberate: `proposed_edits.proposer_signer_id` is NOT NULL,
  so erasing the proposer erases the proposal, and `comments.proposal_id` would then dangle.
  Replies carry the same `proposal_id` as their parent, so one predicate covers whole threads.
- **NULL vs delete.** Columns recording a moderation DECISION about someone else's content are
  nulled, not cascaded — `status`, `decided_at`, `resolved_at` and `resolution` are kept. Deleting
  a moderator must not erase the proposals and comments they ruled on; the ruling is the
  community's history, only the actor's identity is erased. `selfies.reviewed_by` /
  `selfie_reports.resolved_by` carry no FK so they never blocked the delete, but they still held
  the erased signer's id on other people's rows, which erasure should not leave behind.
- **Replies are detached, not deleted.** Other people's replies to a deleted signer's comment get
  `parent_comment_id = NULL` rather than being removed with the subtree. `buildTree()` in
  `src/lib/db/queries.ts` already promotes a parentless reply to a root ("Parent is
  hidden/deleted — promote to root"), so this needs no render-side change and keeps other
  people's words. Parent and child that are BOTH doomed go in the single `DELETE ... WHERE id IN
  (doomed)`; Postgres fires RI triggers after the statement, so intra-statement order is moot.
- **`src/server/actions/me.ts` and `src/server/actions/admin.ts` now delegate** to
  `deleteSigner(db, signerId)`. `removeMySignature` previously deleted only signatures +
  consent_records (not even selfies); `deleteSignerAction` carried a partial copy of the cascade
  (reports / comment_upvotes / comments / signatures / consent_records) that drifted every time a
  table was added. Three implementations of one cascade was the root cause of this bug class, so
  there is now one. Dropped the now-unused `sql` import from admin.ts and `consentRecords` from
  me.ts.
- **`attestations` has no FK to `signers.id`** — not in schema.ts, not in the migrations, not in
  the pglite DDL. A product attestation is claimed by an email address, not a signer, so there is
  nothing to cascade. The suite pins this with a test asserting an attestation survives a signer
  deletion untouched, so a future `claimed_by_signer_id` column can't silently reintroduce the bug.
- **`tests/server/signer-deletion.activity.test.ts`** (new, 17 tests): one case per activity kind
  (endorsement, comment + votes both directions, legacy comment_upvotes, comment report as
  reporter, report they moderated, @-mention, proposal upvote, proposed edit with upvotes,
  proposal they decided, thread on their proposal, detached reply, self-reply, selfie review,
  attestation), plus a `seedBusySigner()` fixture wired into every table run through all three
  deletion paths. Every case asserts the delete succeeded AND that a bystander's row is intact and
  unmangled — deletion that takes other people's content with it is the same root cause.
- **`tests/server/signer-deletion.referrals.test.ts`** — three roborev fixes: the `Module._load`
  patch moved from import time into `beforeAll` so its lifetime is a symmetric hook pair (at
  import time, a throw during collection meant `afterAll` never ran and every later suite in the
  worker got this file's dead pglite back from `require("@/lib/db")`); `expectInviterGone` renamed
  to the role-neutral `expectSignerGone` (it was being called with an invitee id); and the
  "still deletes a signer who was themselves referred" case now asserts the survivor's
  `displayName` and `referredBySignerId` instead of `toBeTruthy()`, which passed on a mangled row.
  Docstring narrowed to claim only the referral FK now that the rest is covered elsewhere.

### Verification

- `./node_modules/.bin/vitest run` → **58 files / 422 tests passing** (baseline 56/403, plus
  1 file / 2 tests from `c0784bb` already on the branch, plus this commit's 1 file / 17 tests).
- `./node_modules/.bin/tsc --noEmit` → clean.
- `eslint` on the four touched source/test files: 10 errors, all pre-existing `no-explicit-any` /
  `no-require-imports` on the lazy-`getDb` pattern. HEAD had 11 across the same files; removing
  admin.ts's cascade removed one.
- **Mutation-verified**: each of the 12 cascade statements was individually neutered (`AND false`
  appended to its WHERE clause) and the suite re-run. Every one produced a red test, and the 11
  that back a real constraint produced a genuine SQLSTATE 23503 naming it:
  `endorsements_signer_id_fkey`, `comment_votes_signer_id_fkey`,
  `comment_mentions_mentioned_signer_id_fkey`, `comment_reports_reporter_signer_id_fkey`,
  `comment_upvotes_signer_id_fkey`, `proposal_upvotes_signer_id_fkey`,
  `proposed_edits_proposer_signer_id_fkey`, `proposed_edits_decided_by_fkey`,
  `comment_reports_resolved_by_fkey`, `comments_parent_comment_id_fkey`,
  `comments_proposal_id_fkey`. The `selfies.reviewed_by` mutant failed on assertion only, which is
  correct — that column has no constraint. No statement in the cascade is dead weight.

### Potential concerns to address:

- **The real fix is `ON DELETE` in the schema, not application code.** 14 of the 15 FKs into
  `signers.id` are still NO ACTION. This cascade is now correct but it is ~40 lines of ordered
  statements that any new signer-referencing table will silently break — the next such table will
  reproduce this exact bug, and there is no test that fails when one is added. A migration adding
  `ON DELETE CASCADE` (or SET NULL for the moderation columns) to each FK would let Postgres
  enforce ordering and make `deleteSigner` shrink to one statement. Worth doing; deliberately out
  of scope here because it is a migration against a live DB.
- **Deleting a proposer takes the discussion on their proposal with it**, including other
  people's comments. Unavoidable while `proposer_signer_id` is NOT NULL. The alternative is a
  tombstone signer ("[deleted]") that orphaned content is reassigned to, which is the usual
  answer for forums and would preserve the thread. That is a product decision plus a schema
  change, so it is noted rather than done.
- **`revoke.ts` still has the "legacy Phase 3 tables" framing** but `comments` and
  `comment_upvotes` are both in current schema.ts AND drizzle/0001, so they are guaranteed to
  exist; only `reports` is genuinely absent from the schema. The new code treats only `reports`
  defensively and lets a missing `comments`/`comment_upvotes` throw, which is the honest
  behavior. If some prod DB really lacks them, `drizzle-kit push` would recreate them anyway.
- **`me.ts` and `admin.ts` importing `revoke.ts`** pulls `next/navigation` and `@clerk/nextjs/server`
  into their module graph. Harmless today (tests pass, both already import Clerk) but it does mean
  the three server-action modules are now coupled. If that becomes awkward, `deleteSigner` should
  move to `src/server/signers/delete.ts` as a plain data-layer function with no "use server".
- **No test asserts blob cleanup on the me.ts/admin.ts paths.** Both now hit
  `deleteSelfieBlobsByUrls` with the default Vercel backend, which swallows failures with a
  `console.warn`, so a broken blob delete in production would be silent.

---
