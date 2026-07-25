# Branch Progress: sparkle/agent-0f1d4d02-0724-494b-b81b-0c7e20d30a3c

## Progress Update as of 2026-07-24 20:45 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Merged the homepage-OG worker branch (`sparkle/agent-b6dfc78b-...`), which fixed the site's biggest share leak: the homepage served zero Open Graph tags. On review of that merge I found the nine article short-forms on the new OG card are hand-written paraphrases rather than derived from the document, which is a silent-drift risk on a living versioned document — so I added a tripwire test and documented the coupling.

### Detail of changes made:
- Merged `sparkle/agent-b6dfc78b-6e58-4074-a321-61d765b7f8db` (fast-forward, no conflicts). It added `metadataBase` + a full `openGraph`/`twitter` block to the root metadata export in `src/app/layout.tsx`, a new dynamic card at `src/app/api/og/route.tsx`, a README domain correction (`aibillofrights.org` -> `ai-for-people.org`), and 7 tests.
- **Verified the merge independently rather than trusting the worker's report**: rendered the OG route to a PNG (200, `image/png`, 66,748 bytes) and visually inspected it. Banner/3x3 article grid/amber CTA footer all render correctly; the CTA reads "Be one of the first 1,000 to sign" rather than printing the raw count of ~90, which was the framing constraint.
- **Found on review:** the nine article titles on the card (`ARTICLES` in `src/app/api/og/route.tsx`) are hand-written short forms, NOT loaded from `content/bill-of-rights/`. They are faithful paraphrases of the v0.0.1 headings (the real headings — e.g. "You Have the Right to Know You're Talking to a Machine" — are far too long for a 3x3 grid on a 1200x630 card, so paraphrasing is the right call). But the Bill of Rights is explicitly a *living, versioned* document, so an edit to the markdown would leave the share card silently misrepresenting it to every social feed, with nothing to catch it.
- `src/app/api/og/route.tsx`: exported `ARTICLES` and replaced the one-line comment with an explanation of why the list is hand-written, why that is a drift risk, and which test guards it.
- `tests/app/og-articles-drift.test.ts` (new): parses `versions.json` for the current version, extracts the `## Article N:` headings from that version's markdown, and asserts (a) `ARTICLES` has one entry per article, (b) there are exactly nine, since the 3x3 grid layout depends on it, and (c) each short form still shares a distinctive stem with the heading in the same position — so a reorder or a substantive rewrite trips it. Stop-word filtered and stem-compared at 6 chars so inflections ("manipulation" vs "Manipulated") don't false-positive.
- **Proved the guard actually fails on drift** rather than being a test that can never go red: temporarily rewrote Article 7 to "Weather Forecasting Standards", confirmed the test failed with an actionable message naming the file to update, then restored the content file and confirmed green.

### Verification
- `./node_modules/.bin/vitest run` — **40 files / 212 tests, all passing** (up from 37/202 at branch start; +7 from the merged worker, +3 from the drift guard).
- `./node_modules/.bin/tsc --noEmit` — clean.
- Homepage OG card rendered and visually inspected at 66,748 bytes.

### Potential concerns to address:
- The OG card's article short-forms remain a manual mirror of the document. The new test catches drift but cannot fix it — when it goes red, a human must rewrite the short forms. That is the intended trade-off (mechanical shortening of those headings would read badly), but it is a maintenance obligation worth knowing about.
- `content/bill-of-rights/v0.0.1.spec.json` declares only **1** principle while the markdown has **9** articles. The spec file appears incomplete/stale. Nothing in this change depends on it (the drift test reads the markdown), but anything that trusts `spec.json` as the machine-readable source of the nine principles — including the "implement as code" surface advertised in the README — would be wrong today.
- The current published version is **0.0.1**, not the `1.0.0` referenced in the README's curl example.

---

## Progress Update as of 2026-07-24 20:15 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Opened a viral-growth workstream on the signature funnel. This first commit lays the shared groundwork that several parallel workstreams all depend on — two new `signers` columns (`why_i_signed`, `referred_by_signer_id`) and a canonical share-URL builder at `src/lib/share/urls.ts` — so that the follow-on work (homepage OG cards, referral attribution, "why I signed", signer-page redesign) can proceed in parallel without colliding on the same files.

### Detail of changes made:
- **Diagnosis that motivated this work.** Verified against production: `https://ai-for-people.org/` serves **zero** Open Graph / Twitter meta tags (`src/app/layout.tsx` sets only `title` + `description`, no `openGraph`, no `metadataBase`). Every share of the homepage — the URL people actually copy, and the one `signInvitation` emails point at — unfurls as a bare link with no image. Per-signer pages (`/signatories/[id]`) *do* unfurl correctly; the `og:image` resolves and returns a 1200x630 PNG. Live signature count is 90 (`/api/signers/recent`), and that number is surfaced in four places, where at this scale it reads as counter-proof rather than social proof. There is no analytics package in `package.json` and no referral attribution in the schema, so share→signature conversion is currently unmeasurable.
- `src/lib/db/schema.ts`: Added two columns to `signers`. `whyISigned` (`why_i_signed`, nullable text) holds an optional short statement captured at signing time — it feeds the signer's public page, their OG share card, and the default share text. `referredBySignerId` (`referred_by_signer_id`, nullable uuid) is a **self-referencing FK** to `signers.id` recording which signer's share link brought this person in; the self-reference requires the `AnyPgColumn` return-type annotation (already imported at the top of the file) to break the circular type reference.
- `drizzle/0007_why_i_signed_and_referrals.sql`: Hand-written migration adding both columns. Uses `ADD COLUMN IF NOT EXISTS` and wraps the FK constraint in a `DO $$ ... EXCEPTION WHEN duplicate_object` block so the migration is safely re-runnable against a database where `db:push` has already applied the schema. Adds `signers_referred_by_idx` on the new FK column, since the natural query ("how many people did signer X bring in?") filters on it.
- `tests/_helpers/pglite-db.ts`: Added the two new columns to the raw `create table signers` DDL. This helper mirrors what drizzle-kit would generate and is what the whole vitest suite runs against — **it must be updated by hand whenever `schema.ts` changes**, or every DB-touching test breaks.
- `src/lib/share/urls.ts` (new): Single source of truth for outbound share links. Every share URL now carries `?ref=<signerId>` (who shared it) and `?via=<channel>` (which surface it came from — `x`, `linkedin`, `email`, `copy`, `qr`, `invite`, `confirmation-email`). Exports `withShareParams`, `signerShareUrl`, `homeShareUrl`, `parseRef`, `parseChannel`, plus the `isValidRef` / `isShareChannel` guards. Refs are validated as UUIDs and **silently dropped if malformed**, so a bad id can never propagate into a share link or reach a DB write. `withShareParams` preserves an existing query string (`?` vs `&`) and keeps any URL fragment at the end.
- `tests/lib/share-urls.test.ts` (new): 16 tests covering the query-separator logic, fragment preservation, invalid-ref rejection, trailing-slash normalisation on the site URL, and both the plain-object and `URLSearchParams` shapes that `parseRef`/`parseChannel` accept (Next passes the former from `searchParams`, the latter shows up in client code).

### Verification
- `./node_modules/.bin/vitest run` — **37 files / 202 tests, all passing**.
- `./node_modules/.bin/tsc --noEmit` — clean, exit 0.
- Note: `pnpm` is not on the PATH in this worktree; deps were installed via `corepack pnpm install`, and test/typecheck are run through `./node_modules/.bin/*` directly. `corepack pnpm test` fails because pnpm's own deps-status check re-invokes a bare `pnpm`.

### Potential concerns to address:
- `drizzle/0007` is hand-written rather than generated by `drizzle-kit generate`, so `drizzle/meta/_journal.json` and the snapshot files were **not** updated. The project has been applying schema via `db:push` (per README), so this is consistent with existing practice, but a future `drizzle-kit generate` may produce a duplicate migration for these columns. The `IF NOT EXISTS` guards mean that would be a no-op rather than a failure.
- `referred_by_signer_id` is a self-FK with no `ON DELETE` behaviour specified (`no action`). If signer deletion is ever added (distinct from the current revoke flow, which soft-deletes), rows referencing a deleted signer will block the delete. Revocation today does not hard-delete signer rows, so this is not currently reachable.
- The `why_i_signed` column has no length constraint at the DB level. The UI is expected to cap it (~200 chars); server-side validation must enforce that too rather than relying on the client, since it renders into a public OG image.
- The site's canonical domain is `ai-for-people.org`. `README.md` still refers to `aibillofrights.org`, which is **a different, unrelated site** (a Wix page titled "Global AI Bill of Rights"). The README should be corrected so the wrong domain does not leak into share copy.

---
