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

### Editing a version's text after a deploy has synced it

`syncVersions` hashes each version's markdown and **throws if an already-synced version's text changes** — published documents are immutable. The build fails with:

```
Error: Version 0.1.0 hash mismatch: existing <hash> vs new <hash>.
The canonical document text is meant to be immutable.
```

This also fires while a version is still being *drafted*, because **Vercel preview deployments run `sync-versions` too** (against the `dev` Neon branch). So the first preview build of a PR freezes that version's text, and any later edit to it breaks every subsequent build until the stale row is cleared:

```
pnpm tsx scripts/unsync-version.ts 0.1.0        # dry run — shows what references it
pnpm tsx scripts/unsync-version.ts 0.1.0 --yes  # delete, so the next sync re-inserts it
```

The script refuses if the version is current or if anything references it (signatures, comments, proposed edits, endorsements, attestations, child versions) — a version people have signed or discussed is not a draft. It connects via `DATABASE_URL` from `.env.local`, which per the section above points at the `dev` branch; check that before running it.

Once a version is live in production and signed, its text is genuinely frozen — changing it means publishing a new version.

### What does and doesn't carry forward

Several things are scoped to a specific version row, so bumping `current` changes what the site shows. Published documents are immutable — `syncVersions()` hashes the markdown and throws if an already-synced version's text changes — so the only lever is what you migrate.

- **Signatures do not migrate.** They stay attached to the version that was signed. Someone who signed the previous version reads as not-having-signed the new one and will be shown the sign form again. Public counts (`getSignatureCount`) count *distinct people* across all versions, so re-signing never double-counts anyone.
- **Comments do not migrate on their own.** `comments.base_version_id` points at the version a comment was written against, and the homepage only queries the current version — so without a migration step, publishing hides every existing thread. Ship a small SQL migration re-pointing them, as `drizzle/0008_repoint_comments_to_v0_1_0.sql` does for the 0.0.1 → 0.1.0 publish. **Run it after the deploy**, once `sync-versions` has created the new version row. Only do this when the articles the comments are anchored to are textually unchanged; otherwise the comment ends up attached to wording that moved under it.
- **Endorsements are intentionally left behind.** Endorsing a version is a statement about that version's text.

### Post-deploy steps for the 0.1.0 publish

Migrations in this repo are applied by hand (`pnpm tsx scripts/apply-migration.ts <file>`) — the drizzle journal is not the source of truth here (see `AGENTS.md`). **This list is the single source of truth for what is still pending; remove entries once they have been applied.** After the deploy:

```
pnpm tsx scripts/apply-migration.ts drizzle/0007_signatures_signer_signed_at_idx.sql
pnpm tsx scripts/apply-migration.ts drizzle/0008_repoint_comments_to_v0_1_0.sql
```

0007 adds **two** indexes on `signatures` — `(signer_id, signed_at DESC)` for the deduplicated signer lists behind `/signers` and `/signatories`, and `(signed_at DESC)` for the `signed_at > cutoff` scan behind `/api/signers/recent`, the homepage ticker polled about once a minute by every open tab. Correctness is unaffected either way; without them those queries fall back to full scans. 0008 carries the existing discussion forward. Both are safe to re-run.

0008 only moves comments onto v0.1.0 while v0.1.0 is the *current* version, so running it out of order — for instance after a later version has taken over — is a no-op rather than a move that would leave threads hidden with their original scoping destroyed.

### Rolling back the 0.1.0 publish

Reverting `current` in `versions.json` puts the site back on 0.0.1, but comments moved by 0008 would then be scoped to the wrong version and disappear again. 0008 snapshots the original mapping into `comment_version_backup_0008` and `proposed_edit_version_backup_0008` before moving anything, so the move is reversible:

```sql
UPDATE "comments" AS c
   SET "base_version_id" = b."base_version_id"
  FROM "comment_version_backup_0008" AS b
 WHERE c."id" = b."id";

UPDATE "proposed_edits" AS p
   SET "base_version_id" = b."base_version_id"
  FROM "proposed_edit_version_backup_0008" AS b
 WHERE p."id" = b."id";
```

This restores only the rows that were carried forward — comments genuinely written against v0.1.0 are not in the backup and are left where they are. The backups are populated inside the same statement that performs the move, so they always match what was actually moved, including on a re-run.

⚠️ **Do not run `pnpm db:push` while the backup tables exist.** They are intentionally not declared in `src/lib/db/schema.ts`, and drizzle-kit treats tables missing from the schema as drops — one push would silently destroy the only copy of the original mapping. Drop them yourself once the publish has settled:

```sql
DROP TABLE IF EXISTS "comment_version_backup_0008";
DROP TABLE IF EXISTS "proposed_edit_version_backup_0008";
```

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
