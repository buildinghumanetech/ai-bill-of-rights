@AGENTS.md

# Project-specific instructions

These instructions apply to any Claude session working in this project.

## Progress logging on every commit

For **every commit** on a development branch, the corresponding progress log in `prd/branch commit updates/<branch-name>.md` must be updated. The log gives a future Claude session enough context to ramp up without re-reading every commit.

### Workflow

1. **Find the log file.** Run `git rev-parse --abbrev-ref HEAD` to get the branch name. Look for `prd/branch commit updates/<branch-name>.md`.
2. **If the log file exists**, read its most recent entry, then prepend a new dated entry at the top.
3. **If the log file does not exist**, create it with `# Branch Progress: <branch-name>` as the header and add the first entry.
4. **Stage the log file alongside your code changes** so the commit includes both. Do not split the doc update into a separate commit.
5. **After committing, tell the user explicitly: "I committed and updated `prd/branch commit updates/<branch-name>.md`."**

### Entry format

```
## Progress Update as of [YYYY-MM-DD HH:MM Pacific]
*(Most recent updates at top)*

### Summary of changes since last update
[One paragraph maximum summarizing what's changed since the previous entry.]

### Detail of changes made:
- [Bullet points with enough context for a future LLM to ramp up quickly on the branch. Reference file paths, function names, architectural decisions, and why things were done a certain way.]

### Potential concerns to address:
- [Bullet points calling out anything in the codebase that is or could become an issue.]

---
```

Use Pacific time. Round to the nearest 15 minutes.

### Backstops

- `.git/hooks/pre-commit` prints a warning if the branch progress log isn't staged. The warning does not block the commit, but the workflow above is still required.

## Design specs

- Design specs (one per major feature) live in `docs/superpowers/specs/`.
- Implementation plans live in `docs/superpowers/plans/`.
- The current MVP spec is `docs/superpowers/specs/2026-05-18-ai-bill-of-rights-design.md` — read it before writing any application code.
