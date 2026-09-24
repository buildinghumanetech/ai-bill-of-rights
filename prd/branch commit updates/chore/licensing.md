# Branch Progress: chore/licensing

## Progress Update as of 2026-09-24 00:15 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Split licensing: the Bill of Rights text moves to CC BY 4.0, site code stays MIT. Documentation only; no application code touched.

### Detail of changes made:
- `LICENSE-CONTENT`: full CC BY 4.0 legal text (from the SPDX license list).
- `README.md`: License section rewritten. `content/bill-of-rights/` is CC BY 4.0; everything else stays MIT under `LICENSE`; third-party material quoted in `content/resources/` keeps its original terms; no trademark grant.
- Reason: the text is meant to spread and be adapted with attribution. MIT is a software license and fits prose badly.

### Potential concerns to address:
- Proposed rights submitted through `/propose` carry no license grant from the proposer. Before any proposed text is merged into a published version, the propose flow needs a line saying submissions are licensed under CC BY 4.0.
- The site does not show the text license anywhere a reader sees it. Consider a footer line on the published document pages.
- `LICENSE` copyright line reads "Building Humane Tech"; confirm whether counsel wants the legal entity name there.

---
