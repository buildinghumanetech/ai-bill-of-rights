# AI Bill of Rights

A versioned, signable, open-source living document at **ai-for-people.org**.

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
pnpm tsx scripts/unsync-version.ts 0.1.0 --allow-current        # dry run — shows what references it
pnpm tsx scripts/unsync-version.ts 0.1.0 --allow-current --yes  # delete the stale row
pnpm sync-versions                                              # re-insert it from disk
```

**You will almost always need `--allow-current`.** `sync-versions` marks the version named by `versions.json`'s `current` as current, and the version you are drafting *is* that version — so the frozen row is the current row, and without the flag the script refuses before it looks at anything else.

The flag is narrow: it only relaxes the `is_current` check. The script still refuses outright if **anything references the version** — signatures, comments, proposed edits, endorsements, attestations, or a child version — because a version people have signed or discussed is not a draft and no flag should make it one. "Current, but referenced by nothing" is precisely a frozen draft.

It also refuses when the current version **could not be put back**: it must be listed in `versions.json` history *and* all three of its files (`v<x>.md`, `v<x>.agents.md`, `v<x>.spec.json`) must be on disk, since `sync-versions` reads all three. Otherwise the "no current version" state below would be permanent rather than momentary. This check applies only to the *current* row — a stale non-current leftover that is absent from disk is exactly what this tool is for, and stays deletable.

Between the delete and the re-sync the database has **no current version** and pages that read it will not render, so run `pnpm sync-versions` straight afterwards. The script prints a warning to that effect when the row it deleted was current.

It connects via `DATABASE_URL` from `.env.local`, which per the section above points at the `dev` branch; check that before running it.

Once a version is live in production and signed, its text is genuinely frozen — changing it means publishing a new version.

### What does and doesn't carry forward

Several things are scoped to a specific version row, so bumping `current` changes what the site shows. Published documents are immutable — `syncVersions()` hashes the markdown and throws if an already-synced version's text changes — so the only lever is what you migrate.

- **Signatures do not migrate, and nothing ever deletes them.** A signature stays attached to the version that was signed — that is the record of what text the person actually agreed to, and it is not ours to rewrite. Every public surface is nevertheless version-agnostic: `getSignatureCount`, `listSignatures`, `listRecentSignersSince`, `/signers`, and `/signatories` all work in *distinct signers across all versions*, so publishing a new version removes nobody from any count or list, and re-signing never double-counts anyone.

  What publishing *does* change is per-person state, because `signatures` is unique on `(signer_id, version_id)`: someone who signed the old version has no row against the new one. `resolveSignatureStatus` (`src/lib/db/signature-status.ts`) reports that case as **`signed-earlier`**, distinct from `not-signed`, so `SignModal` acknowledges the signature they already have and offers a one-click re-affirm (`reaffirmMySignature`) instead of handing a prior signer a blank form. **Do not "fix" this by backfilling signature rows onto the new version** — that would record consent to Articles nobody read, on a document whose Article 1 says opt-out is not consent. The re-affirm writes a real, freshly hashed consent record and leaves the earlier signature intact.
- **Comments do not migrate on their own.** `comments.base_version_id` points at the version a comment was written against, and the homepage only queries the current version — so without a migration step, publishing hides every existing thread. Ship a small SQL migration re-pointing them, as `drizzle/0010_repoint_comments_to_v0_1_0.sql` does for the 0.0.1 → 0.1.0 publish. **Run it after the deploy**, once `sync-versions` has created the new version row. Before writing one, check BOTH kinds of anchor drift — in each case the stale anchor still resolves, which is why nothing complains:

  1. **Sentence counts**, not just wording. Comments are anchored to `article-NN-s-M`, so a sentence inserted mid-article shifts every later anchor in it and silently re-attaches those comments to the wrong sentence. v0.1.0 does this once (Article 7 gains the COPPA definition as s-5), and 0010 remaps `article-07-s-5` → `article-07-s-6` to compensate.
  2. **"Connects to" pill slugs.** A comment can be anchored to a pill, as `article-NN-connect-<slug>`, so renaming a resource page orphans every comment on that pill. v0.1.0 renames nine (the HumaneBench pages take the benchmark's own principle names); 0010 remaps them. Derive the rename set from `git show <commit>:src/app/HomepageArticles.tsx` against HEAD, never from the working tree — otherwise you write mappings for pills that never shipped and miss ones that did.

     **Which commit depends on which rows you are reaching, and getting this wrong is how 0010 shipped incomplete.** For the rows a migration *moves* off the old version, `main` is right: only a pill that shipped there can carry an old-version comment. But comments written on the **/proposed tab are authored against the draft**, so they are already on the target version and can be anchored to pills that only ever existed on the branch — invisible in the `main` diff. Use `main` **union** whatever commits the preview actually served, and check every one of them, not just the latest: 0010's Articles 10 and 11 pointed at three different principles across three draft commits.

     Only remap a genuine **rename** — the same reference under a new slug. A pill that was removed, or swapped for a different reference, has no successor to move a comment to; leave those anchors stale and say so, in the SQL and here.

  **Article numbers in anchors are zero-padded** (`article-07`, not `article-7`) because the app builds them from `article.number`, which is the two-digit string `"01"`…`"11"`. An unpadded literal in a migration matches nothing and fails silently. `tests/lib/db.migration-0010-repoint-comments.test.ts` derives its anchors from the real `articles` array and asserts every `article-<n>-` literal in the SQL uses a number the app emits.

  Pills that were **removed or swapped** rather than renamed are deliberately *not* remapped — reattaching a comment to a different reference would misrepresent what someone said. For v0.1.0 that is `article-06-connect-humanebench-principle-empowerment` (Article 6 lost its HumaneBench pill). Those comments stay pointing at a pill that no longer renders and are recoverable from the backup tables.
- **Endorsements are intentionally left behind.** Endorsing a version is a statement about that version's text.

### Post-deploy steps for the 0.1.0 publish

Migrations in this repo are applied by hand (`pnpm tsx scripts/apply-migration.ts <file>`) — the drizzle journal is not the source of truth here (see `AGENTS.md`). **This list is the single source of truth for what is still pending; remove entries once they have been applied.** After the deploy:

```
pnpm tsx scripts/apply-migration.ts drizzle/0009_signatures_signer_signed_at_idx.sql
pnpm tsx scripts/apply-migration.ts drizzle/0010_repoint_comments_to_v0_1_0.sql
```

0009 adds **two** indexes on `signatures` — `(signer_id, signed_at DESC)` for the deduplicated signer lists behind `/signers` and `/signatories`, and `(signed_at DESC)` for the `signed_at > cutoff` scan behind `/api/signers/recent`, the homepage ticker polled about once a minute by every open tab. Correctness is unaffected either way; without them those queries fall back to full scans. 0010 carries the existing discussion forward. Both are safe to re-run.

0010 only moves comments onto v0.1.0 while v0.1.0 is the *current* version, so running it out of order — for instance after a later version has taken over — is a no-op rather than a move that would leave threads hidden with their original scoping destroyed.

**These two were written as 0007 and 0008 and renumbered on merge**, because `main` had meanwhile added its own `0007_why_i_signed_and_referrals.sql` and `0008_referral_fk_on_delete_set_null.sql`. Migrations here are applied by hand off this list, so two files sharing a number is an ordering trap rather than a cosmetic problem. Note the consequence you will see at the psql prompt: 0010's backup tables are still named `comment_version_backup_0008` / `proposed_edit_version_backup_0008`. That is deliberate — renaming them would orphan the backups in any database that already ran an earlier form of the file, and those are the only copy of the pre-move anchors.

### Rolling back the 0.1.0 publish

Reverting `current` in `versions.json` puts the site back on 0.0.1, but comments moved by 0010 would then be scoped to the wrong version and disappear again. 0010 snapshots the original mapping into `comment_version_backup_0008` and `proposed_edit_version_backup_0008` **in the same statement that performs the move** — so the backup always reflects exactly what was moved, and a run that moves nothing records nothing. That makes the move reversible:

```sql
BEGIN;

UPDATE "comments" AS c
   SET "base_version_id" = b."base_version_id",
       "anchor_id" = COALESCE(b."anchor_id", c."anchor_id")
  FROM "comment_version_backup_0008" AS b
 WHERE c."id" = b."id";

UPDATE "proposed_edits" AS p
   SET "base_version_id" = b."base_version_id",
       "target_anchor_id" = COALESCE(b."anchor_id", p."target_anchor_id")
  FROM "proposed_edit_version_backup_0008" AS b
 WHERE p."id" = b."id";

COMMIT;
```

**The `COALESCE` is load-bearing, and so is the transaction.** An earlier form of 0010 created the backup tables without an `anchor_id` column at all; step `1b` adds it, but there is nothing to backfill it from, so in any database that ran that form the backed-up anchor is `NULL`. A plain `SET "anchor_id" = b."anchor_id"` would then write `NULL` over a live anchor — orphaning the comment, since a row is supposed to have exactly one of `anchor_id` / `proposal_id` — and the second statement would go on to violate `NOT NULL` on `proposed_edits.target_anchor_id`. Without `BEGIN`/`COMMIT` the comments damage has already committed by the time that error surfaces. Run these two together, in one session, or not at all.

The anchor must be restored alongside the version, because 0010 remaps anchors: `article-07-s-5` → `article-07-s-6` (the COPPA insertion) in the move itself, plus nine renamed HumaneBench pill slugs in its last two statements. Restoring only `base_version_id` would put the comments back on v0.0.1 while leaving them pointing one sentence past where they were written, or at pill slugs that do not exist on v0.0.1. The backup is taken *before* either remap, so it holds the original anchor regardless of which statement changed it.

⚠️ 0010's last two statements repair stale pill anchors on rows that were **already** scoped to v0.1.0. Those rows fall into two groups, and the rollback treats them differently:

- **Comments written on the /proposed tab against the v0.1.0 draft** were authored on the target version, so they were never moved and are **not** in the backup tables. The rollback does not reverse their anchor. They are a handful at most; the original slug is in the git history of `src/app/HomepageArticles.tsx`.
- **Rows in an environment where an earlier form of 0010 already ran** reached v0.1.0 *by being moved*, so they **are** in the backup and the rollback does touch them — which is exactly why the `COALESCE` above matters. Note what it can and cannot do: it stops a `NULL` backup from orphaning the comment, but there is no original anchor recorded to put back, so the row goes to v0.0.1 still carrying its **v0.1.0** slug. A stale anchor on the right version, rather than no anchor at all. The original is in the git history of `src/app/HomepageArticles.tsx` if you need it.

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
