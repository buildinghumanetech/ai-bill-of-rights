# Branch Progress: fix/mirror-sanitized-values

## Progress Update as of [2026-09-24 00:30 Pacific]
*(Most recent updates at top)*

### Summary of changes since last update

First commit on the branch. Fixes the GitHub mirror sending the raw form submission while the database stored the sanitised, truncated version — so a mirrored public issue could carry control characters and text past the length limits that appear nowhere on the site. Found while reporting on PR #82 and left unfixed there as outside that task's scope.

### Detail of changes made:

- **`src/server/proposals/core.ts`**: `createNewArticleProposal` now returns the text it actually wrote, as `stored: StoredProposalText` on the success branch. It already computed those values (it sanitises, then validates the sanitised values); they were simply discarded. Returning them is what makes the fix structural rather than a second call to `sanitizeProposalText` at the mirror site — one place produces the stored text, and every consumer reads that.
- **`src/server/actions/proposals.ts`**: the `mirrorProposalToGitHub` call reads `result.stored.*` instead of calling `formData.get()` a second time. The mirror and the row can no longer disagree, by construction.
- **`tests/server/proposals.mirror-sanitized.test.ts`** (new, 4 tests): drives the REAL server action against a real pglite database with only Clerk, the mirror and `revalidatePath` mocked, and asserts on the payload the mirror receives — control characters stripped, `BODY_MAX` truncation applied, the payload byte-identical to the persisted row, and nothing mirrored when the validator rejects. **Verified these fail on revert**: restoring the `formData` reads turns 3 of the 4 red (the fourth asserts no mirror on rejection, which the fix does not affect). Follows the `Module._load` + `vi.hoisted` pattern established in `tests/server/invite.share-attribution.test.ts`, which is required because `@/lib/db/lazy` reaches the client through a lazy CommonJS `require` that Vite's alias and Vitest's registry do not intercept.
- **`tests/server/proposals.test.ts`** (+3 tests): assert `stored` is stripped and truncated and matches the persisted row exactly — the guarantee the mirror now depends on.

### Potential concerns to address:

- **`getDb()` memoises the client in a module-scope `let`, which is a live trap for any test driving a server action.** A per-test pglite database silently does the wrong thing: the first test's client is cached and every later action writes there while the test asserts against its own fresh, empty instance. The first draft of the new test hit exactly this and failed with an undefined row. The file now shares one database created in `beforeAll` and clears `proposal_upvotes` then `proposed_edits` between tests. Any future test that drives these actions needs the same shape, and nothing in the code warns you.
- **Sharing one database also interacts with the 3-proposals-per-hour rate limit**, which is enforced before validation. Without the between-test cleanup, the fourth submission in the file would return a rate-limit error while the test was asserting a validation failure — a green-looking assertion passing for the wrong reason. The cleanup handles it; the coupling is worth knowing about.
- **The mirror still omits the pull quote entirely.** `MirrorInput` carries title, body and rationale only, so the mirrored issue is missing the line the article is meant to close with. Not a divergence introduced here and not in scope, but the mirrored issue is an incomplete picture of the proposal.
- **`drizzle/0011` is still not applied to any database** (unchanged from PR #82, listed in README post-deploy). Nothing on this branch depends on it: the mirror path does not read `title` back.

---
