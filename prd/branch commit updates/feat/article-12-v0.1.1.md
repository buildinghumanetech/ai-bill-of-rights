# Branch Progress: feat/article-12-v0.1.1

## Progress Update as of [2026-09-30 22:00 Pacific]
*(Most recent updates at top)*

### Summary of changes since last update
Publishes v0.1.1, which appends Article 12 (Communities Help Define the Standard) in response to Audrey Tang's reply of Saturday, September 26th. Articles 1 through 11 are byte-identical, so no anchor moves and signers are not asked to sign again.

### Detail of changes made:
- New `content/bill-of-rights/v0.1.1.md`, `.agents.md`, `.spec.json`; `versions.json` current is now `0.1.1` with a changelog that matches the frontmatter (the content test compares them, and a `: ` in the YAML changelog breaks parsing, so it is worded without one).
- Article 12 text and pull quote were approved by Erika in conversation: three body sentences plus "Define it with us, then measure it." Pills are `humanebench-as-measurement-infrastructure` and `algorithmic-audit-proposals`, chosen because both resource pages already exist. No Tronto or 6-Pack resource page exists yet.
- `src/app/HomepageArticles.tsx`: added article `"12"`. All "eleven" copy changed to "twelve" (home, /proposed, /propose, share text, invite email, proposal validation, scorecard copy). The scorecard derives its rows from the published markdown, so Article 12 appears there as `not-assessed` for every company.
- `drizzle/0015_repoint_comments_to_v0_1_1.sql`: moves comments and proposed edits from 0.1.0 to 0.1.1, with backup tables. Anchors are unchanged. Listed as pending in `README.md`.
- Tests updated: article count 12, scorecard 12 rows, "3 of 12 commitments", anchor snapshot regenerated (8 new anchors, none changed).
- Signatures were deliberately not backfilled onto 0.1.1 (README forbids it). Earlier signers show as `signed-earlier` with an optional re-affirm. Counts are version-agnostic, so nobody drops out.

### Potential concerns to address:
- 0015 must be applied after the deploy and after `sync-versions` creates the 0.1.1 row, or comments disappear from the homepage in the gap.
- Anyone who signed 0.1.0 is `signed-earlier`, not `signed`. If the product wants them shown as fully signed, that is a code change, not a backfill.
- `v0.1.1.agents.md` replaces the v0.0.1 to v0.1.0 changelog section with a v0.1.0 to v0.1.1 one, plus a one-line pointer to what v0.1.0 added.
- Article 12 has no `prohibited_behaviors` or `test_conditions` yet, like the other stubs.
- The full `vitest run` did not finish in this environment within 6 minutes. Targeted suites pass; CI should run the full suite.

---
