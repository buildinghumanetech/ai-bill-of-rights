# Scorecard content

One file per company: `content/scorecard/<slug>.md`. The slug is the filename
and the URL: `<slug>.md` renders at `/scorecard/<slug>`.

The renderer is only a mechanism. **Every verdict on this page is authored by
hand, by a human, in these files.** Nothing infers, estimates, or fills in a
rating on your behalf.

`example-ai-labs.md` is the format reference. It is a fictional company; so is
every URL in it. Real entries are the project owner's to write.

## The citation rule

> A commitment that carries a status other than `not-assessed` **must** carry
> at least one citation: an absolute `http(s)` URL, a title, and the ISO date a
> human opened it. An uncited claim is a **hard validation error** — the entry
> fails to parse and `/scorecard` refuses to build it.

This is the whole basis on which the page is defensible. It publishes claims
about named companies; each one must trace to a source the reader can go and
check.

The mirror of that rule: `not-assessed` must carry **no** prose and **no**
citations. A commitment nobody has looked at renders as "Not yet assessed" and
is never dressed up as a conclusion.

## File format

YAML frontmatter holds the structured data. The markdown body below it is
free-form scope notes for that company, shown at the bottom of its page.

```markdown
---
company: Acme Intelligence Corp        # required
slug: acme-intelligence-corp           # optional; must match the filename
fictional: true                        # REQUIRED — true or false, no default
oneLiner: One sentence of context.     # optional
homepageUrl: https://example.com       # optional, absolute http(s)
lastReviewed: 2026-07-24               # required, ISO YYYY-MM-DD
reviewedBy: Editorial council          # optional
disputeEmail: hello@ai-for-people.org  # optional, shown as the correction route
assessments:
  - principle: article-1               # anchor id from the Bill of Rights
    status: partial                    # see the vocabulary below
    assessment: |
      What was found, in plain language.
    citations:                         # required for any assessed status
      - url: https://example.com/policy
        title: Name of the document you read
        checkedOn: 2026-07-24
        quote: |                       # optional verbatim excerpt
          The sentence you are relying on.
---

Free-form notes about scope, caveats, or what this entry deliberately does not
cover.
```

### `fictional`

Required, and deliberately has no default. Every entry states outright whether
it describes a real organisation. The page prints a visible banner on fictional
entries and excludes them from any coverage claim, so a demo can never be read
as a verdict.

### Status vocabulary

| Status         | Renders as                | Citation required |
| -------------- | ------------------------- | ----------------- |
| `meets`        | Meets the commitment      | yes               |
| `partial`      | Partially meets           | yes               |
| `falls-short`  | Falls short               | yes               |
| `unclear`      | No clear public evidence  | yes               |
| `not-assessed` | Not yet assessed          | **must be empty** |

`unclear` still needs a citation: "we could not find a public statement" is
itself a claim about the public record, and the reader deserves to see where
you looked.

### Principles

`principle` is an anchor id from the current Bill of Rights markdown
(`content/bill-of-rights/v<current>.md`) — `article-1` through `article-9`. The
list is read from that file at load time, so the two can never drift; if the
Bill gains an article, the scorecard grows a row for it automatically.

Any commitment you omit defaults to `not-assessed`. You never have to list all
nine.

## Adding a company

1. Copy `example-ai-labs.md` to `content/scorecard/<slug>.md`.
2. Set `company`, `slug`, `fictional: false`, `lastReviewed`, `disputeEmail`.
3. Delete every assessment row. Start from nothing assessed.
4. Add one row at a time. For each: read the source first, write the
   assessment from what the source actually says, then record the URL, its
   title, and today's date in `checkedOn`.
5. Run `./node_modules/.bin/vitest run tests/lib/scorecard.load.test.ts`. It
   parses every committed file, so a missing citation or a malformed date fails
   there before it can reach the site.
6. Leave the rest `not-assessed`. A partly-filled entry renders honestly.

## Re-checking

`checkedOn` is per-citation and `lastReviewed` is per-entry; both are printed
on the page. When you re-verify a source, bump its `checkedOn`. When you go
over the whole entry, bump `lastReviewed`. Stale dates are visible to readers
by design.

## Publication status

`/scorecard` is **not linked from the site navigation** and is marked
`noindex`. It is reachable by URL only, until the project owner decides to
publish it. Going live means removing the `robots` block in
`src/app/scorecard/page.tsx` and `src/app/scorecard/[slug]/page.tsx`, and
adding the nav link.
