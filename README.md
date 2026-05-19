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
   - `DATABASE_URL` from a Neon project (free tier is fine for dev)
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` from a Clerk app
   - `RESEND_API_KEY` and `RESEND_FROM_EMAIL` (optional locally — emails will no-op without them)
3. `pnpm db:push` — apply the schema to your Neon dev branch
4. `pnpm sync-versions` — seed the `versions` table from `content/bill-of-rights/`
5. `pnpm dev` — open http://localhost:3000

## Tests

`pnpm test` runs the Vitest suite against an in-memory pglite Postgres. No external services required.

## Publishing a new version of the Bill of Rights

A new version is a PR that adds:
- `content/bill-of-rights/v{X.Y.Z}.md`
- `content/bill-of-rights/v{X.Y.Z}.agents.md`
- `content/bill-of-rights/v{X.Y.Z}.spec.json`

…and bumps `current` in `content/bill-of-rights/versions.json`.

Merging to `main` triggers Vercel to redeploy. The postbuild hook (`scripts/sync-versions.ts`) syncs the new version into the database. Existing signatures stay attached to the version they signed — they do not migrate.

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

## Discussion: comments, upvotes, and moderation

Verified signers can hover any sentence on `/v/[version]` to attach a comment to its anchor. Comments support arbitrary nesting (collapsed past depth 4 desktop). Upvotes are one click; report flags abuse. Five reports on a single comment auto-hide it pending moderator review.

Moderators (signers with `is_admin = true`) get three admin routes:

- `/admin/reports` — pending-report queue (hide comment or dismiss report)
- `/admin/signers` — search signers, grant/revoke admin role, soft-ban
- `/admin/comments` — 100 most recent comments with hide/unhide

Rate limits: 5 comments / signer / minute; 50 / signer / day. Enforced server-side via a DB-backed window count (no Redis).

## License

See `LICENSE`.
