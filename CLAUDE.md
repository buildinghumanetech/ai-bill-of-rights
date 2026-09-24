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

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:6cd5cc61 -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md for details and anti-patterns.

## Agent Context Profiles

The managed Beads block is task-tracking guidance, not permission to override repository, user, or orchestrator instructions.

- **Conservative (default)**: Use `bd` for task tracking. Do not run git commits, git pushes, or Dolt remote sync unless explicitly asked. At handoff, report changed files, validation, and suggested next commands.
- **Minimal**: Keep tool instruction files as pointers to `bd prime`; use the same conservative git policy unless active instructions say otherwise.
- **Team-maintainer**: Only when the repository explicitly opts in, agents may close beads, run quality gates, commit, and push as part of session close. A current "do not commit" or "do not push" instruction still wins.

## Session Completion

This protocol applies when ending a Beads implementation workflow. It is subordinate to explicit user, repository, and orchestrator instructions.

1. **File issues for remaining work** - Create beads for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **Handle git/sync by active profile**:
   ```bash
   # Conservative/minimal/default: report status and proposed commands; wait for approval.
   git status

   # Team-maintainer opt-in only, unless current instructions forbid it:
   git pull --rebase
   git push
   git status
   ```
5. **Hand off** - Summarize changes, validation, issue status, and any blocked sync/commit/push step

**Critical rules:**
- Explicit user or orchestrator instructions override this Beads block.
- Do not commit or push without clear authority from the active profile or the current user request.
- If a required sync or push is blocked, stop and report the exact command and error.
<!-- END BEADS INTEGRATION -->
