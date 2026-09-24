# Branch Progress: ci/add-github-actions

## Progress Update as of [2026-09-24 00:30 Pacific]
*(Most recent updates at top)*

### Summary of changes since last update
First entry. Adds `.github/workflows/ci.yml`, running `tsc --noEmit` and
`vitest run` on every pull request and on pushes to `main`. Before this the
repository had **no GitHub Actions workflows at all** — `.github/` did not exist
on any branch and the Actions API reported `total_count: 0` runs, ever — so the
only checks any PR received were Vercel's deployment ones. A PR could be red on
types or tests and still present an all-green check list.

### Detail of changes made:
- **One job, not two.** `typecheck + tests` installs once and runs both commands.
  Splitting them into parallel jobs would pay the install cost twice; the suite
  is ~97s locally, so the wall-clock saving is not worth doubling the install.
- **Step order is load-bearing.** `pnpm/action-setup` must precede
  `actions/setup-node`, because `cache: pnpm` shells out to `pnpm store path` to
  decide what to cache and fails if the binary isn't there yet.
- **pnpm pinned to major 11.** There is no `packageManager` field in
  `package.json` and no `.nvmrc`, so `action-setup` has nothing to infer from and
  needs an explicit version. `pnpm-workspace.yaml` uses `allowBuilds`, which is
  pnpm 11 syntax, so 11 is the floor. Node is pinned to major 22 (local is
  22.15.1).
- **`--frozen-lockfile`** so a `package.json`/`pnpm-lock.yaml` mismatch fails the
  run instead of quietly resolving something different from local installs.
- **`if: '!cancelled()'` on the test step** so the suite still runs when the
  typecheck fails. One red run then reports both problems rather than hiding the
  tests behind a type error.
- **No services, no secrets.** The suite runs Postgres in-process via pglite and
  references no `process.env` in its helpers; only `.env.example` is tracked. So
  there is nothing to provision and no repo secrets to add.
- **`concurrency` cancels superseded PR runs but never `main`**, so each landed
  commit keeps its own result and a later bisect has a real per-commit signal.

### Verification performed:
Ran exactly what the workflow runs, from a clean `pnpm install --frozen-lockfile`
in a fresh worktree off `origin/main` (`44b0e12`): `tsc --noEmit` clean,
`vitest run` **985 passed (92 files)**. The lockfile was confirmed to already
carry the linux-x64 native packages (`@img/sharp-linux-x64`,
`@img/sharp-libvips-linux-x64`, `@esbuild/linux-x64`), so nothing compiles on
`ubuntu-latest` despite `allowBuilds` disabling build scripts.

### Potential concerns to address:
- **Lint is deliberately NOT in this workflow.** `pnpm lint` currently fails
  repo-wide (~141 errors, overwhelmingly `@typescript-eslint/no-explicit-any` on
  the `db: any` convention used throughout `src/server/`). Adding it would make
  CI red on arrival. Fixing or scoping the lint config is separate work; until
  then nothing enforces lint.
- **Neither Node nor pnpm is pinned in-repo.** The workflow pins majors, but
  there is no `.nvmrc` or `packageManager` field, so local and CI versions can
  drift within a major. Adding `packageManager` would let `action-setup` infer
  the version and keep the two in step — intentionally left out of this change
  to keep it to the workflow itself.
- **Migrations are still not applied by CI**, by design — see `AGENTS.md`. This
  workflow typechecks and tests only; it does not touch a database, so a
  migration that needs applying will still pass CI and must be run by hand.
- **No branch protection.** The workflow existing does not make it required.
  Someone with admin rights has to mark `typecheck + tests` a required status
  check on `main`, or a red run can still be merged.

---
