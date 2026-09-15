# Branch Progress: feat/propose-a-new-right

## Progress Update as of [2026-09-11 12:45 Pacific]
*(Most recent updates at top)*

### Summary of changes since last update

First commit on the branch. Adds a way to propose an entirely new Article, which the site previously had no path for at all: `/proposed` supports commenting on and rewording lines that already exist, so every "you're missing a right" suggestion arrived as a comment anchored to whichever sentence happened to be nearest, where it could not be counted or endorsed. The feature is built on the existing `proposed_edits` / `proposal_upvotes` tables — which were created in drizzle/0001 and have had no UI or server actions since — rather than a new table or an external issue tracker.

### Detail of changes made:

- **`drizzle/0011_new_article_proposals.sql`** (pending — listed in README post-deploy). Adds `title`, `pull_quote`, `hidden_at`, `hidden_reason` to `proposed_edits`, plus `proposed_edits_kind_created_idx`, `proposed_edits_status_created_idx`, `proposal_upvotes_proposal_idx`. Idempotent throughout per AGENTS.md.
- **`src/lib/db/schema.ts`**: `proposedEdits` gains the `new_article` kind and the four columns above, and converts from the object form to the `(t) => [...]` form so the two new indexes can be declared. They are declared in schema.ts deliberately — `drizzle-kit push` drops indexes it does not know about, the trap already documented on `signers` and `selfies`. Exports `NEW_ARTICLE_ANCHOR = "document-end"`, the sentinel `target_anchor_id` for these rows (the column is NOT NULL and a new article attaches to nothing). Nothing in `anchor-map.ts` emits it and nothing should start.
- **`src/lib/proposals/validate.ts`**: limits + `validateNewArticle` + `sanitizeProposalText`, imported by both the client form and the server action so the inline counter and the server rejection cannot drift. Rejects a proposer-supplied "Article 12:" prefix — numbering is assigned at publish time, and a claimed number would have to be edited out of live upvoted text later.
- **`src/server/proposals/core.ts`**: plain (non-`"use server"`) module, same containment reasoning as `server/comments/core.ts`. `createNewArticleProposal` sanitises *then* validates (the other order lets control characters pad a short body past the minimum — there is a test), and auto-inserts the proposer's own upvote. `toggleProposalUpvote`, `hideProposal` / `unhideProposal` (soft only: `comments.proposal_id` is a FK onto the row and the upvotes are other people's), `decideProposal`, and `renderProposalAsMarkdown`.
- **`src/lib/db/proposal-queries.ts`**: `listProposedRights`. Upvote and comment counts come from correlated subqueries, not joins — a proposal has two independent one-to-many children and joining both multiplies each count by the other's cardinality. Tested explicitly. Sorted by endorsements desc, `created_at` desc as tiebreak.
- **`src/server/actions/proposals.ts`**: Clerk-authed wrappers. `baseVersionId` is resolved server-side from `is_current` and never read from the form — a client-supplied version id would file a proposal against a superseded draft, invisible on `/propose`, and report success. Rate limit is 3/hour (comments are 20), branching on `RateLimitError` by type rather than message per that module's contract.
- **`src/lib/github/mirror-proposal.ts`**: optional, env-gated (`GITHUB_PROPOSAL_REPO` + `GITHUB_TOKEN`), fire-and-forget, never read back. Rationale for mirror-not-store is in the module header: endorsements have to be one-per-verified-signer, which GitHub reactions cannot express.
- **UI**: `/propose` (`src/app/propose/page.tsx` + `SignModalClient.tsx`), `ProposeRightForm`, `ProposedRightCard` (optimistic endorse, expand, author withdraw), `/admin/proposals` + `AdminProposalActions` (accept / reject / hide / copy-as-markdown with an `Article N` placeholder). Entry-point links added to the bottom CTA block on `/` and `/proposed`.
- **`tests/server/proposals.test.ts`**: 10 tests over pglite, all green. Covers the sanitise-before-validate ordering, one-vote-per-signer, the count-multiplication trap, hidden visibility, author-vs-stranger withdraw, and non-admin decisions.

### Potential concerns to address:

- **The migration is not applied.** `/propose` selects `title` and will fall into its empty-state catch until `drizzle/0011` runs. It is in the README post-deploy list; nothing runs it automatically.
- **Lint adds 10 `no-explicit-any` errors**, all of the `db: any` form used throughout `src/lib/db/queries.ts` and `server/comments/core.ts`. `pnpm lint` is already red on `main` (141 errors) with the same rule, so this is consistent rather than new debt — but it is more of it, and a shared `Db` type would retire the whole class.
- **`pnpm build` was not verified**, only `tsc --noEmit` (clean) and the test suite. The build in the authoring sandbox failed in `layout.tsx` fetching Geist from Google Fonts, before reaching any file on this branch.
- **No moderation ceiling on the public queue.** Proposals are visible immediately, gated only by verified-signer status, the 3/hour limit and post-hoc admin hide. If the queue gets brigaded the answer is probably a `pending` review gate before public listing, which `status` already models.
- **`comments.proposal_id` threads are counted but not rendered.** The count on each card is live; there is no UI to read or add those comments yet. Discussion currently happens on the card's endorsement alone, which is thinner than intended.
- **Accepted proposals are spliced into the next version by hand.** `renderProposalAsMarkdown` and the admin copy button produce the block, but nothing writes `content/bill-of-rights/<next>.md`, and `status` only moves to `published` when someone sets `published_in_version_id` manually.
- **`splitIntoSentences` in core.ts is a second sentence splitter**, deliberately not shared with `splitSentences` in `HomepageArticles` (whose output defines live comment anchors). Its output is human-reviewed before it is committed. Do not merge the two.

---
