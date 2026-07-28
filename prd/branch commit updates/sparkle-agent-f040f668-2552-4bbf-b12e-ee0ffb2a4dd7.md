# Branch Progress: sparkle/agent-f040f668-2552-4bbf-b12e-ee0ffb2a4dd7

## Progress Update as of [2026-07-26 20:00 Pacific]
*(Most recent updates at top)*

### Summary of changes since last update

Finished the signer landing page (`src/app/signatories/[id]/page.tsx`) and the commitments summary it renders: the gist under each of the nine article titles is now pinned in the *rendered HTML* rather than only as a function, the clamped pull quote no longer emits an opening curly quote with no partner, the "second sign CTA" test now counts the button it claims to pin instead of a substring that also matches a heading, `gist()`'s dead `?? body.trim()` fallback and its doc comment now agree, and the gist test stopped duplicating nine article bodies as expected literals.

### Detail of changes made:

- **`src/components/CommitmentsSummary.tsx`** — `gist()` now ends `?? ""` instead of `?? body.trim()`. The old fallback was unreachable-as-documented: `splitSentences` (`src/app/HomepageArticles.tsx:437`) ends in `.filter(Boolean)`, so it returns `[]` *only* when `body.trim() === ""`, meaning `body.trim()` could only ever evaluate to `""`. The doc comment claimed "returns the body unchanged if it has no recognisable sentence break" — true behaviour, but it comes from `splitSentences` returning `[wholeBody]`, not from the fallback. Comment rewritten to say where each behaviour actually comes from.
- **`src/app/signatories/[id]/page.tsx`** — dropped the literal `&ldquo;`/`&rdquo;` from the `line-clamp-4` blockquote. A closing curly quote inside a clamped element is the first character the clamp eats, so any statement long enough to clamp rendered `“…text…` + browser ellipsis + nothing to close it, on exactly the ~375px widths the clamp was added for. Chose *dropping* the marks over hanging them on `before:`/`after:` pseudo-elements: a closing mark pinned outside the clamp visually attaches to the ellipsis rather than to the sentence, so it only relocates the artifact. The `border-l-4 border-blue-600` rule plus the `<figcaption>` attribution already read as a pull quote, and the statement now copy-pastes without stray punctuation. Rationale is recorded in the JSX comment above the blockquote so the next reader does not "restore" the marks.
- **`tests/app/signatories.signer-page.test.tsx`**:
  - New test `renders each commitment's gist, not its whole body, under the title` — asserts the HTML contains `gist(article.body)` for every article (HTML-escaped through a new `asHtml()` helper, same `'` → `&#x27;` transform the title loop already used) AND does *not* contain article 01's second sentence, "Opt-out is not consent." Positive alone would pass if the component rendered the whole body; negative alone would pass if it rendered nothing. Together they pin both "the gist renders" and "it is condensed."
  - `repeats the sign CTA below the commitments list` now counts `">Add your name</"` (the button's whole text node) and expects exactly 1, instead of the bare substring `"Add your name"` expecting 2. The bare form also matched the first CTA's heading (`Add your name to the <a`), so rewording copy the test has no opinion about failed it with `expected 1 to be 2`. Position assertions left untouched.
  - `bounds the pull quote's height` gained a balanced-quote-marks assertion over the blockquote's inner HTML: counts of `“`/`&ldquo;` must equal counts of `”`/`&rdquo;`. Written as an invariant rather than "contains no quote marks" so it holds whether the marks are dropped (today) or moved outside the clamp later.
- **`tests/app/commitments-summary.gist.test.ts`** — `EXPECTED` (nine hand-pasted first sentences) replaced by `PINNED`, holding two canaries: article 01 (multi-sentence — the split must happen) and article 05 (one long em-dashed sentence — it must not). The other seven are covered by derived per-article assertions: non-empty prefix of the body, plus a new "drops the rest of a multi-sentence body / keeps a lone sentence whole" check. That check decides multi-sentence-ness with `/[.!?]\s/.test(body.slice(0, -1))` rather than `splitSentences`, because asking the splitter whether the body splits and then asserting it split is circular. The old `toEqual(Object.keys(EXPECTED))` coverage guard became "every pinned number is still a shipping article" — total coverage is now automatic since the derived loop runs over `articles`.

### Verification

- Mutation-verified the gist-wiring test both ways: (a) deleting the `<p>{gist(article.body)}</p>` line → red on the positive assertion; (b) swapping it for `{article.body}` → red on `not to contain 'Opt-out is not consent.'`. Restored after each.
- Mutation-verified the CTA count: renaming the first CTA's heading to "Put your name on the …" keeps it green (the point of the change); replacing the button's label turns it red (`expected +0 to be 1`).
- Mutation-verified the balanced-quote pin: re-adding a lone `&ldquo;` inside the blockquote fails with `expected 1 to be +0`.
- `./node_modules/.bin/vitest run` → 57 files / 408 tests passing. `./node_modules/.bin/tsc --noEmit` → clean.

### Potential concerns to address:

- The derived multi-sentence oracle in the gist test (`/[.!?]\s/` before the last character) is deliberately simpler than `splitSentences`. It agrees with the splitter for all nine current bodies, but an article body containing "e.g. ", "U.S." or a decimal would make the oracle see a break where the splitter (correctly) sees none, and the test would fail on a correct gist. If such copy lands, move that article into `PINNED` or teach the oracle the same exceptions.
- `splitSentences` still splits an abbreviation followed by a capitalised word ("e.g. Common Crawl" → "Public corpora, e.g."). That limit is pinned as a decision at the bottom of the gist test, not fixed. Article copy currently avoids it.
- The pull quote's visual identity now rests entirely on the left border and the figcaption. If a future redesign drops the border, the quote will read as ordinary body copy — the marks are not there to carry it.
- `corepack pnpm test` still fails in this environment; run `./node_modules/.bin/vitest run` directly. `corepack pnpm install` writes a placeholder into `pnpm-workspace.yaml` that must be reverted with `git checkout -- pnpm-workspace.yaml`.

---
