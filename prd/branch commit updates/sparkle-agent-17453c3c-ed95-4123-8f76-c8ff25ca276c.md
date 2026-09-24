# Branch Progress: sparkle/agent-17453c3c-ed95-4123-8f76-c8ff25ca276c

## Progress Update as of 2026-09-24 01:15 Pacific (second merge)
*(Most recent updates at top)*

### Summary of changes since last update
Merged `origin/main` again (PRs #85 sign-in fix and #86 GitHub mirror) to clear PR #83's second conflict. The only conflict was the 0011 header comment, which main had also corrected; this branch's wording was kept. Neither PR adds a migration.

### Detail of changes made:
- `drizzle/0011_new_article_proposals.sql`: comment-only conflict, resolved to this branch's text ("there is no UPDATE and no existing row is touched"). SQL unchanged.
- `pnpm vitest run`: 1004 passed, 1 failed. The failure is `tests/components/propose-right-form.license.test.tsx` > "sends the licence id with the submission", and it fails identically on pristine origin/main (515596d), so it comes from main, not from this branch.

### Potential concerns to address:
- main is red on that licence test, which looks like an interaction between #84 (licence) and #85/#86 (propose sign-in/submission changes). `ProposeRightForm` belongs to the propose-flow owner, so this branch does not touch it.

---

## Progress Update as of 2026-09-24 01:15 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Merged `origin/main` (PR #84, which adds CC BY licensing to /propose and migration 0012) to clear a README conflict on PR #83. PR #84 had been deployed to production without 0012 applied, so /propose was showing the amber "could not be loaded" panel again. 0012 has now been applied to production and the page renders the empty queue. README says nothing is pending (0009–0012).

### Detail of changes made:
- Found the regression while resolving the conflict: the production deploy from about 10 minutes earlier selected `proposed_edits.license`, which did not exist yet.
- Applied `drizzle/0012_proposal_license.sql` (as shown on origin/main) with `pnpm tsx --env-file=<vercel-pulled prod env> scripts/apply-migration.ts`: 2 of 2 statements applied. Verified that `license` (text) and `license_granted_at` (timestamptz) exist, both nullable and without defaults, as the migration intends. Live /propose then showed "Nothing proposed yet. Yours would be the first."
- README conflict resolution: main's pending block (0009–0012 plus prose) was replaced with "Nothing is pending", a 0012 record paragraph (keeping the `count-unlicensed-proposals.ts` pointer), and a note to apply schema-dependent migrations BEFORE the deploy.
- `pnpm vitest run`: 991/991 (94 files).

### Potential concerns to address:
- The same failure mode will recur: nothing stops a PR whose code depends on an unapplied migration from deploying. A CI/postbuild schema check (fail the Vercel build if an expected column is missing) would catch it.

---

## Progress Update as of 2026-09-24 00:30 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Read-only queries against production confirmed that 0009 and 0010 were already applied, so README's "Post-deploy steps" now says nothing is pending. It keeps a short record of what each of 0009–0011 did, and the rollback section is unchanged.

### Detail of changes made:
- 0009 evidence: both `signatures_signer_signed_at_idx` and `signatures_signed_at_idx` exist.
- 0010 evidence: 0.1.0 is current; all 32 comments are on 0.1.0, none on 0.0.1; `comment_version_backup_0008` holds exactly those 32 rows, all with a non-null `anchor_id` (so the current form of the migration ran, not the early anchor-less form); both backup tables have PKs; no rows carry any of the nine old pill slugs; `proposed_edits` has 0 rows.
- `README.md`: the pending command block was replaced with "Nothing is pending", plus a one-paragraph record that says not to drop `comment_version_backup_0008`. The renumbering note and the rollback SQL were kept, because `tests/lib/db.migration-0010-repoint-comments.test.ts` parses the rollback SQL out of README.
- `pnpm vitest run`: 985/985.

### Potential concerns to address:
- `src/app/propose/page.tsx:78` still points operators at "README post-deploy steps" for 0011. That only fires on an un-migrated DB, and README still explains that migrations are applied by hand, so it was left alone (another agent owns /propose right now).

---

## Progress Update as of 2026-09-24 00:00 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Applied `drizzle/0011_new_article_proposals.sql` to the production Neon database (the one behind ai-for-people.org), which clears the amber "queue of proposals could not be loaded" panel on /propose. This branch records that: 0011 comes off the README's pending-migrations list, and the migration's header comment no longer claims a "guarded UPDATE" it does not contain.

### Detail of changes made:
- The credential came from Vercel (project `ai-bill-of-rights`, Production-scoped `DATABASE_URL`, Neon endpoint `ep-muddy-bonus…-pooler`, db `neondb`). It was pulled into a session scratch directory with `vercel env pull`, never into the repo. No `.env*` file exists in this worktree or the main checkout, and the Development scope has no `DATABASE_URL`.
- Applied with `pnpm tsx --env-file=<pulled file> scripts/apply-migration.ts drizzle/0011_new_article_proposals.sql`: 7 statements applied, 0 skipped. Note that `apply-migration.ts` does NOT load dotenv itself, so `DATABASE_URL` has to be in the process env (`--env-file` works).
- Verified afterwards in `information_schema`/`pg_indexes`: `proposed_edits.{title,pull_quote,hidden_at,hidden_reason}` plus the indexes `proposed_edits_kind_created_idx`, `proposed_edits_status_created_idx` and `proposal_upvotes_proposal_idx`. On an uncached fetch (`x-vercel-cache: MISS`), production /propose now renders "Nothing proposed yet. Yours would be the first."
- `README.md`: removed the 0011 command and its explanatory paragraph from "Post-deploy steps" (per AGENTS.md, entries come off that list once they have been applied).
- `drizzle/0011_new_article_proposals.sql`: header comment corrected, SQL unchanged.

### Potential concerns to address:
- 0009 and 0010 are still listed as pending in README and were NOT applied here (out of scope; 0010 moves data). Someone should confirm their real state on production.
- `apply-migration.ts` log output mislabels statements whose text starts with a comment (it prints the comment as the statement preview). This is cosmetic only.
- `package.json` carries an unrelated uncommitted `packageManager` field that pnpm added. It was deliberately left out of this commit.

---
