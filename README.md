# AI Bill of Rights

A versioned, signable, open-source living document at **aibillofrights.org**.

This repo is the source of truth for the document. Each version of the Bill of Rights lives as a markdown file in `content/bill-of-rights/`. The website at `/v/[version]` renders the document, lets verified humans sign it, and shows a public list of signers.

## Stack

- Next.js 16 (App Router) · React 19 · TypeScript 5 · Tailwind 4
- Clerk for email/SMS OTP authentication
- Neon Postgres + Drizzle ORM
- Resend for transactional email
- Deployed on Vercel

## Local development

1. `pnpm install`
2. Copy `.env.example` to `.env.local` and fill in:
   - `DATABASE_URL` — see "Dev / prod database isolation" below
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` — see "Dev / prod Clerk instances" below
   - `RESEND_API_KEY` and `RESEND_FROM_EMAIL` (optional locally — emails will no-op without them)
3. `pnpm db:push` — apply the schema to your Neon dev branch
4. `pnpm sync-versions` — seed the `versions` table from `content/bill-of-rights/`
5. `pnpm dev` — open http://localhost:3000

### Dev / prod database isolation

Local development must **never** point at the production database. We use [Neon branches](https://neon.tech/docs/introduction/branching) for copy-on-write isolation:

- `main` branch — production data. Lives in Vercel env as `DATABASE_URL` (Production scope only).
- `dev` branch — copy-on-write fork of `main` for local development. Lives in `.env.local` and also in Vercel env as `DATABASE_URL` (Preview scope).

To set up a dev branch:

1. Open the [Neon console](https://console.neon.tech) → your project → Branches → **Create branch**, parent = `main`, name = `dev`.
2. Open the new `dev` branch → Connection details → copy the **pooled** connection string.
3. Paste it into `.env.local` as `DATABASE_URL`.
4. Run `pnpm db:push` then `pnpm sync-versions` to apply the schema and seed the `versions` table on the dev branch.

Maintenance scripts under `scripts/` (e.g. `rename-version.ts`, `merge-version-rows.ts`) connect via `DATABASE_URL` from `.env.local` — so they only ever touch the dev branch as long as your `.env.local` is correct. Double-check before running anything destructive.

### Dev / prod Clerk instances

We use two Clerk instances on a single Clerk account:

- **Development instance** (`pk_test_…` / `sk_test_…`) — used in `.env.local` and in Vercel Preview deployments. Email OTPs from this instance are branded `[Development]` and sent from `notifications@accounts.dev` (Clerk's shared sender). That's fine for testing.
- **Production instance** (`pk_live_…` / `sk_live_…`) — used in Vercel Production scope only. Configure the from-address on `verify@ai-for-people.org` (or your own verified domain) via Clerk Dashboard → Customization → Email templates.

Never commit live keys. They go in Vercel env (Production scope) and nowhere else.

## Tests

`pnpm test` runs the Vitest suite against an in-memory pglite Postgres. No external services required.

## Publishing a new version of the Bill of Rights

A new version is a PR that adds:
- `content/bill-of-rights/v{X.Y.Z}.md`
- `content/bill-of-rights/v{X.Y.Z}.agents.md`
- `content/bill-of-rights/v{X.Y.Z}.spec.json`

…and bumps `current` in `content/bill-of-rights/versions.json`.

Merging to `main` triggers Vercel to redeploy. The postbuild hook (`scripts/sync-versions.ts`) syncs the new version into the database.

### What does and doesn't carry forward

Several things are scoped to a specific version row, so bumping `current` changes what the site shows. Published documents are immutable — `syncVersions()` hashes the markdown and throws if an already-synced version's text changes — so the only lever is what you migrate.

- **Signatures do not migrate.** They stay attached to the version that was signed. Someone who signed the previous version reads as not-having-signed the new one and will be shown the sign form again. Public counts (`getSignatureCount`) count *distinct people* across all versions, so re-signing never double-counts anyone.
- **Comments do not migrate on their own.** `comments.base_version_id` points at the version a comment was written against, and the homepage only queries the current version — so without a migration step, publishing hides every existing thread. Ship a small SQL migration re-pointing them, as `drizzle/0008_repoint_comments_to_v0_1_0.sql` does for the 0.0.1 → 0.1.0 publish. **Run it after the deploy**, once `sync-versions` has created the new version row. Only do this when the articles the comments are anchored to are textually unchanged; otherwise the comment ends up attached to wording that moved under it.
- **Endorsements are intentionally left behind.** Endorsing a version is a statement about that version's text.

### Post-deploy steps for the 0.1.0 publish

Migrations in this repo are applied by hand (`pnpm tsx scripts/apply-migration.ts <file>`) — the drizzle journal is not the source of truth here. After the deploy:

```
pnpm tsx scripts/apply-migration.ts drizzle/0007_signatures_signer_signed_at_idx.sql
pnpm tsx scripts/apply-migration.ts drizzle/0008_repoint_comments_to_v0_1_0.sql
```

0007 is an index (correctness is unaffected, but `/signers` and `/signatories` fall back to full scans without it). 0008 carries the existing discussion forward. Both are safe to re-run.

## "Implement as Code" surface for AI builders

Every version of the Bill of Rights ships with three files:

- `v{X.Y.Z}.md` — human-readable document
- `v{X.Y.Z}.agents.md` — LLM/coding-agent instruction file (drop into your project as `CLAUDE.md`, `.cursorrules`, `AGENTS.md`, etc.)
- `v{X.Y.Z}.spec.json` — machine-readable per-principle spec

Builders can grab these directly:

```bash
curl -fsSL https://aibillofrights.org/v/1.0.0/agents.md > AGENTS.md
```

…or visit `/v/[version]/as-code` for tool-specific tabs, download buttons, and the public attestation form. Public attestations appear at `/attestations`; claims naming frontier AI labs queue for admin review at `/admin/attestations` before going live.

To promote a signer to admin (Erika, project moderators, etc.), flip `signers.is_admin = true` directly in the Neon console (no admin UI in MVP).

## Project structure

See `docs/superpowers/specs/2026-05-18-ai-bill-of-rights-design.md` for the canonical design spec and `docs/superpowers/plans/2026-05-18-phase-1-signable-mvp.md` for the implementation plan.

## License

See `LICENSE`.
