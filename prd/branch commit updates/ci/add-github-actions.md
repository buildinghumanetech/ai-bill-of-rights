# Branch Progress: ci/add-github-actions

## Progress Update as of [2026-09-24 00:45 Pacific]
*(Most recent updates at top)*

### Summary of changes since last update
The first CI run went green (all steps, 2m31s) but raised two runner annotations.
Addressed both: bumped all three actions to `@v5` and pinned `ubuntu-24.04`.

### Detail of changes made:
- **Actions bumped v4 -> v5** (`actions/checkout`, `actions/setup-node`,
  `pnpm/action-setup`). All three at v4 declare `runs.using: node20`, which
  GitHub has deprecated — the runner force-ran them on Node 24 and annotated the
  run. Confirmed against each repo's `action.yml` that v5 declares `node24` for
  all three, so v5 is the version that actually clears the warning rather than
  just a number bump.
- **`runs-on: ubuntu-latest` -> `ubuntu-24.04`.** `ubuntu-latest` migrates to
  Ubuntu 26 on 2026-10-19. Pinning means an unrelated push is never the thing
  that broke CI because the image moved underneath it; bumping becomes a
  deliberate change with its own run to prove it.

### Potential concerns to address:
- **v5 is not the newest.** Latest releases are `actions/checkout@v7.0.1`,
  `actions/setup-node@v7.0.0`, `pnpm/action-setup@v6.1.0`. v5 was chosen because
  it is the minimum that moves off the deprecated Node 20 runtime; going further
  is a larger change (v5->v6/v7 carry their own breaking changes) and was not
  needed to clear the annotation. Worth revisiting on its own.
- **The pin now needs periodic attention.** `ubuntu-24.04` will eventually be
  retired by GitHub. That is the trade for not being surprised — but it does mean
  the version is now something a human has to move.

---

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
