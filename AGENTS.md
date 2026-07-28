<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

# Database migrations are applied by hand

`drizzle/meta/_journal.json` is **not** the source of truth for what has been applied. It stops at idx 4 while `drizzle/0005…` onward exist as loose SQL files. The production database was originally populated with `drizzle-kit push` (no tracking table), so `drizzle-kit migrate` is not usable against it.

Consequences to work with, not around:

- Apply a migration with `pnpm tsx scripts/apply-migration.ts drizzle/<file>.sql`. It splits on `--> statement-breakpoint`, tolerates "already exists" errors, and is safe to re-run.
- **Write every migration to be idempotent** (`IF NOT EXISTS`, guarded `UPDATE`s) — re-running is normal here, not exceptional.
- **A new migration file does not apply itself.** Nothing in CI or the Vercel build runs it. If a change needs one, say so in the PR description and in `README.md` under the deploy steps, or it will silently never run.
- `drizzle-kit generate` will re-emit migrations that exist only as unjournaled files. Check `drizzle/` for an existing file before generating.
- **Pending migrations are listed in `README.md`**, under "Post-deploy steps". That list is the single source of truth — do not restate it here, and remove entries from it once they have been applied.

