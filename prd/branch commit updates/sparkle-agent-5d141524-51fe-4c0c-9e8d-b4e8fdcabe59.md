# Branch Progress: sparkle/agent-5d141524-51fe-4c0c-9e8d-b4e8fdcabe59

## Progress Update as of [2026-07-24 21:00 Pacific]
*(Most recent updates at top)*

### Summary of changes since last update

First entry on this branch. Built the **scorecard mechanism** — content schema,
loader, validator, public pages, and dynamic OG cards for rating companies
against the nine commitments in the AI Bill of Rights — and deliberately
authored **zero verdicts about real companies**. The only committed content is
one transparently fictional entry (`Example AI Labs`) that exists as the format
reference and as the fixture the tests render against. The defining rule of the
feature is enforced in code: an assessment without a citation is a hard
validation error, not a warning.

### Detail of changes made:

**Content schema — `content/scorecard/<slug>.md`**

- One file per company. YAML frontmatter (parsed by `gray-matter`, already a
  dependency) holds all structured data; the markdown body is free-form scope
  notes rendered at the bottom of the company page. Frontmatter was chosen over
  a heading-anchor format like `content/bill-of-rights/` because it makes the
  citation requirement structurally enforceable rather than a convention.
- Required per entry: `company`, `fictional` (boolean, **no default** — every
  entry must state outright whether it describes a real organisation),
  `lastReviewed` (ISO date). Optional: `slug`, `oneLiner`, `homepageUrl`,
  `reviewedBy`, `disputeEmail`.
- Per commitment: `principle` (anchor id, e.g. `article-1`), `status`, and —
  for any assessed status — `assessment` prose plus a non-empty `citations`
  list of `{url, title, checkedOn, quote?}`.
- Status vocabulary: `meets`, `partial`, `falls-short`, `unclear`, and
  `not-assessed`. `unclear` deliberately requires a citation too — "no public
  statement exists" is itself a claim about the public record.
- `content/scorecard/README.md` documents the format, the citation rule, the
  status table, and the step-by-step path for adding a company.

**Principle list — `src/lib/scorecard/principles.ts`**

- The nine commitments are **derived from the published Bill of Rights**, not
  re-typed: `versions.json` → `current`, then `v<current>.md` parsed with the
  existing `parseDocument()` from `src/lib/markdown/parse.ts`, dropping the
  preamble. If the Bill gains a tenth article the scorecard grows a tenth row
  with no code change, and the two can never drift. Memoised; `__resetPrincipleCache()`
  is the test seam.

**Validator — `src/lib/scorecard/parse.ts`**

- `parseScorecardEntry(raw, slug, principles?)` throws `ScorecardValidationError`
  carrying **every** problem found, not just the first — a half-validated entry
  is worse than none.
- The citation rule: any status other than `not-assessed` requires prose **and**
  at least one citation with an absolute http(s) URL, a title, and an ISO
  `checkedOn`. Missing or malformed → hard error.
- The mirror rule (the "unassessed path"): `not-assessed` must carry **no**
  prose and **no** citations. This is what keeps a gap honestly empty instead of
  quietly implying a verdict nobody made.
- Commitments the author omits are materialised as explicit `not-assessed` rows,
  so `entry.assessments` is always exactly nine long and never sparse — the
  renderer can't accidentally hide a gap.
- Dates: YAML turns an unquoted `2026-07-24` into a `Date` and a quoted one into
  a string; `normalizeDate()` accepts both and emits ISO. Known limitation noted
  below.

**Loader — `src/lib/scorecard/load.ts`**

- `listScorecardSlugs()` (skips `README.md`), `getScorecardEntry(slug, dir?)`,
  `loadAllScorecardEntries(dir?)`, `latestReviewDate()`. The `dir` parameter
  exists so tests can point at a temp directory.
- Fails loudly: a missing file returns `null` (so a page can 404), but an
  existing-but-malformed file **throws**. `loadAllScorecardEntries` aggregates
  every failure into one error naming each bad file — a broken entry can't
  silently vanish from the published page.
- `getScorecardEntry` rejects slugs that aren't kebab-case, which also closes
  path traversal via the URL segment.

**Pages — `src/app/scorecard/`**

- `/scorecard` — company × commitment matrix (horizontally scrollable below
  ~46rem), the nine commitments listed out, coverage counts that **exclude
  fictional entries**, and the methodology block.
- `/scorecard/[slug]` — one section per commitment with status pill, prose,
  and every source rendered as link + full URL + `checked <date>` + optional
  pull quote. Unassessed commitments render a dashed panel saying so in words
  ("not a pass and not a failure — no claim is being made either way").
- `Methodology.tsx` is shared by both pages and is the visible disclosure the
  task required: what this is, what it is not, that every claim is cited, that
  silence is not a verdict, when it was last reviewed, and how to dispute an
  entry (mailto with a pre-filled subject). It also prints the full label legend.
- `FictionalBanner` prints a loud "is not a real company" panel on fictional
  entries; the index table tags them `EXAMPLE`.
- Share row (X / LinkedIn / email) built through `withShareParams()` from
  `src/lib/share/urls.ts` so channel attribution can't drop off.
- **Both pages are `robots: { index: false, follow: false }` and are NOT linked
  from site navigation** — reachable by URL only until the owner publishes. The
  README says exactly what to remove to go live.

**OG cards — `src/app/api/og/scorecard/`**

- `card.tsx` holds shared Satori-safe chrome in the family of the signer card:
  emerald `#059669` banner, white body, amber `#fffbeb` footer CTA.
- `/api/og/scorecard` — index card with commitment/company/assessment counts.
- `/api/og/scorecard/[slug]` — per-company card: a 3×3 grid of the nine
  commitments colour-coded by status, plus an unmissable "EXAMPLE ENTRY — NOT A
  REAL COMPANY" strip on fictional entries. Both were rendered to PNG and
  visually inspected, and fetched live from `next dev` (HTTP 200, `image/png`).

**Tests — 52 new tests across 3 files**

- `tests/lib/scorecard.parse.test.ts` (27) — the citation rule from every angle:
  no `citations` key, empty list, all four assessed statuses, bad/missing URL,
  bad/missing `checkedOn`, missing title, missing prose; plus the unassessed
  path (rejects smuggled-in prose or citations) and entry-level validation.
- `tests/lib/scorecard.load.test.ts` (11) — parses all committed content,
  asserts every committed assessment has a citation, asserts **every committed
  entry is marked fictional**, aggregate failure, sorting, traversal guard.
- `tests/app/scorecard.page.test.tsx` (14) — renders both pages via
  `renderToStaticMarkup` (with `next/link` and `next/navigation` stubbed),
  asserting the methodology is on the page, that Article 5 renders as
  not-assessed and contains none of the verdict labels, that the noindex/OG
  metadata is right, and that an unknown slug 404s.
- Every company name in every test and fixture is invented: `Example AI Labs`,
  `Acme Intelligence Corp`, `Placeholder Systems`, `Zeta Placeholder`.

**Verification run**

- `./node_modules/.bin/vitest run` → 40 files / 254 tests passing (baseline was
  37 / 202; +3 files, +52 tests, no regressions).
- `./node_modules/.bin/tsc --noEmit` → clean.
- `next dev` on :3117 → `/scorecard` 200, `/scorecard/example-ai-labs` 200,
  `/api/og/scorecard/example-ai-labs` 200 `image/png`, unknown slug 404. Both
  pages screenshotted and read through; both OG PNGs opened and inspected.

### Potential concerns to address:

- **No real assessments exist, by design.** This branch ships the mechanism
  only. Every verdict is the project owner's to author by hand. The loader test
  asserts that every committed entry is `fictional: true` — that test will need
  updating (deliberately, as a checkpoint) the first time a real entry lands.
- **The page is unlisted, not private.** `noindex` plus no nav link keeps it out
  of search and out of the site's surface area, but the URL is guessable and the
  route is public. If that isn't acceptable pre-launch, it needs auth or a
  removal from the build.
- **Date rollover.** An unquoted YAML date like `2026-13-45` is turned into a
  valid `Date` by js-yaml before the validator ever sees it, and normalises to
  `2027-02-14` rather than erroring. Quoted bad dates are rejected. Low impact
  (the rendered date is visibly wrong), but it is a hole in "fails loudly".
- **Prose is rendered as plain paragraphs**, matching `src/app/resources/[slug]`.
  Markdown emphasis in an `assessment` or in the body notes will show as literal
  asterisks. If authors want formatting, wire in `remark` (already a dependency).
- **`unclear` is the riskiest label to publish.** It asserts a negative about the
  public record. The methodology block explains the distinction, but it is worth
  the owner deciding whether to use that status at all before going live.
- **Coupling to `content/bill-of-rights/`.** The principle list reads that
  directory at load time (read-only). Renaming an article anchor there would
  invalidate every scorecard entry referencing it — loudly, which is the intent,
  but it is a cross-directory dependency worth knowing about.
- The scorecard is not wired into `sitemap`/nav/`scripts/sync-versions.ts`, and
  no DB tables were added — it is entirely file-backed, like `content/resources`.

---
