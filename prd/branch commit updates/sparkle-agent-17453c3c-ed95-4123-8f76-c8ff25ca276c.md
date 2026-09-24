# Branch Progress: sparkle/agent-17453c3c-ed95-4123-8f76-c8ff25ca276c

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
