# Branch Progress: feat/propose-a-new-right

## Progress Update as of [2026-09-14 18:00 Pacific]
*(Most recent updates at top)*

### Summary of changes since last update

Applied the reviewed patch to this branch unmodified (clean `git apply`, no rejects), then made the three corrections that came out of review: collapsed the admin markdown preview onto the one renderer, replaced the `require("@/lib/db")` idiom with `getDb()`, and stopped an unreadable proposal queue from rendering as an empty one. Also moved this log from `feat-propose-a-new-right.md` to `feat/propose-a-new-right.md` so it matches the branch name the way CLAUDE.md specifies and the other `feat/*` logs do.

### Detail of changes made:

- **Third sentence splitter removed.** `renderPreview` in `src/app/admin/proposals/page.tsx` carried its own copy of the split-and-anchor logic that `renderProposalAsMarkdown` in `src/server/proposals/core.ts` already implements, so the markdown an admin copied and the markdown publishing emits could drift apart silently on any edit to either. `renderProposalAsMarkdown` now takes `number: number | string` and exports `ARTICLE_NUMBER_PLACEHOLDER = "N"`; `renderPreview` is a four-line delegation that maps the row's `body` onto the renderer's `newText`. The `Article N` placeholder behaviour is unchanged and now has two tests, one of which asserts the placeholder render is character-identical to a numbered render after substituting the number.
- **`splitIntoSentences` (core.ts) and `splitSentences` (HomepageArticles) remain separate, deliberately.** That separation is documented in both places and was NOT touched: the HomepageArticles one defines live comment anchors, and coupling a publish-time helper to it could re-point existing comments.
- **One DB idiom.** `src/app/propose/page.tsx` used `require("@/lib/db")` behind two `eslint-disable` comments; both call sites now use `getDb()` from `@/lib/db/lazy`, matching `src/app/admin/proposals/page.tsx`. `src/lib/db/proposal-queries.ts` had a private `getDefaultDb()` — a third copy of the six-line resolver that `lazy.ts` exists to eliminate (see its header) — now folded onto `getDb()` too. Three `eslint-disable @typescript-eslint/no-require-imports` comments and the associated `{ db: any }` annotations are gone.
- **An un-migrated database no longer looks like an empty one.** `listProposedRights` selects `proposed_edits.title`, added by `drizzle/0011`, which is applied by hand. The bare `catch {}` on `/propose` turned `column "title" does not exist` into "Nothing proposed yet", making an un-migrated deploy, a database outage and a genuinely empty queue the same screen — and the first two would never be noticed, because nobody is paged by an empty state. Added `src/lib/db/error-kind.ts` (`classifyDbError`) which classifies by SQLSTATE first (42703/42P01 → `schema`; class 08 and Node socket codes → `connection`), falls back to message regexes for errors that crossed a boundary and lost the code, and walks the `cause` chain because the Neon HTTP driver wraps the underlying fetch failure. `/propose` now holds a `QueueState` discriminated union and renders a distinct amber `QueueUnavailable` panel — different copy for `schema` vs `connection` — plus a `console.error` that names the likely missing migration. **The no-500 posture is unchanged**: the page still renders, the form above it still works.
- **README corrected.** The post-deploy note for 0011 still said `/propose` "falls into its empty-state catch" on an un-migrated database — stale the moment correction 3 landed. It now describes the distinct panel and the log line.
- **Tests**: `tests/lib/db.error-kind.test.ts` (10 new) covering both SQLSTATE and message-fallback paths, the wrapped-cause case, unset `DATABASE_URL`, code-beats-message precedence, and a cyclic cause chain. `tests/server/proposals.test.ts` gains 2 placeholder-contract tests. Full suite: 985 passed across 92 files. `tsc --noEmit` exits 0.

### Potential concerns to address:

- **`pnpm build` fails in this sandbox, and it is NOT this branch.** It fails prerendering `/resources/[slug]` with `@clerk/clerk-react: Missing publishableKey`, plus `DATABASE_URL is not set` warnings from `layout`. Both are missing environment variables; no file on this branch appears anywhere in the build log. Note the failure is NOT the Geist/Google-Fonts fetch reported from the authoring sandbox — there is no font error here at all.
- **The `/propose` unavailable state now shows in preview/test builds without a `DATABASE_URL`**, where the old code showed an empty queue. That is the intended consequence of the fix, but it is a visible behaviour change for preview deploys.
- **The migration is still not applied.** `drizzle/0011` is listed in README post-deploy and is Erika's call, by hand. Until it runs, `/propose` shows the amber `schema` panel rather than the queue.
- **`classifyDbError` is heuristic at the edges.** SQLSTATE matching is exact, but the message regexes are a fallback and a driver that reworded its errors could fall through to `unknown`, which renders the generic connection copy. That is a safe default (never "empty"), but it is not a guarantee.
- Everything in the previous entry's concerns list still stands — no moderation ceiling on the public queue, comment threads counted but not rendered, accepted proposals spliced by hand.

---

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
