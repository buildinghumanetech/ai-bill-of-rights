# Branch Progress: feat/post-sign-share

## Progress Update as of 2026-09-24 09:45 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Migrations 0013 (`invitations`) and 0014 (`share_links`) are applied to production and verified, so the merge blocker is cleared. README's pending list is now empty and records how they were applied.

### Detail of changes made:
- Fresh production backup before applying: `~/db-backups/ai-bill-of-rights-prod-20260924-093933-pre-0013-0014.dump` (86 KB, 18 tables with data).
- Read-only pre-check: both tables absent; 0007 columns present; 92 signers with a signature (the 9:36 PT signer `a57e8839…` is the owner testing with a second account — confirmed by her).
- Applied with `psql --single-transaction -v ON_ERROR_STOP=1 -f 0013 -f 0014` on the direct (non-pooler) host; verified tables, all six constraints (FKs SET NULL / CASCADE, both UNIQUEs, PKs), `invitations_inviter_signer_id_idx`, zero rows in each, 92 signers. Production env file deleted afterwards.
- `README.md`: "Pending: none."; records the method and what 0013/0014 do; "0007 through 0014 have all been applied".

### Potential concerns to address:
- None blocking merge. Post-merge: confirm the production deploy (homepage, Sign form, /signers shows 92).

---

## Progress Update as of 2026-09-24 09:30 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
CI failed on PR #94 at the typecheck step (tests all passed): `src/app/s/[slug]/route.ts` used Next's `RouteContext` global, which only exists after `next dev`/`next build` generates `.next/types` — present locally because the dev server had run, absent in CI. The route now types its context by hand. Also hardened both confirmation-email paths so a (supposedly impossible) throwing slug lookup can no longer drop the email.

### Detail of changes made:
- `src/app/s/[slug]/route.ts`: `ctx: { params: Promise<{ slug: string }> }` instead of `RouteContext<"/s/[slug]">`. Verified by running `tsc --noEmit` with `.next/types` moved aside, which is what CI sees.
- `src/server/actions/sign-from-modal.ts` and `src/server/actions/sign.ts`: `getOrCreateShareSlug(...).catch(() => null)`. The helper already never throws; this guards the email against that promise being broken later, so it still goes out with the long link.
- `tests/server/sign-from-modal.attribution.test.ts`: the "lookup blows up" case now also asserts the confirmation email is sent, with the long `?ref=` link. Previously it only asserted the signature, and the email was silently dropped in that case.
- Full suite: 107 files, 1,124 tests pass.

### Potential concerns to address:
- Still blocked on applying migrations 0013 + 0014 to production before merge (see previous entry and the PR).
- Local typechecks can pass on generated `.next/types` that CI lacks; run `tsc` with `.next/types` absent (or `next typegen` in CI) before trusting a green local typecheck.

---

## Progress Update as of 2026-09-24 07:00 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
First commit on this branch: Phase 1 of the "more signers" push. The thank-you step is rebuilt around sharing (real-first-name greeting with signer number and milestone, "Bring Two Friends.", why → share with a live card preview, short links, selfie hidden, invites collapsed with a one-email-per-address-ever guard). The homepage now recognizes a signer of the current version (headline, Share button, caption, live banner, "You" badges). "Remove my signature" (keeps the account) is split from "Delete my account" (moved to /account), and a returning signer opening the modal lands on share instead of a screen with destructive buttons. Referral chain traced and its one gap fixed; /admin/referrals added. Two new migrations (0013 invitations, 0014 share_links) must be applied to production BEFORE this merges.

### Detail of changes made:
- **Why this branch exists.** On 2026-09-24 production signing had been broken for 11 weeks by unapplied migration 0007 (applied that night via `psql --single-transaction`). While testing, the owner found the post-sign experience let people down (no lasting confirmation) and accidentally deleted her own signer row via the modal's "Delete my account" (verified from DB + Vercel logs: owner-only `deleteMyAccount` path, 4:46:09 PT).
- **Thank-you step** (`src/app/SignModal.tsx`): `signerGreeting()` uses the REAL first name (typed, or Clerk `user.firstName`) — never `displayName`, which may be masked. Order: greeting → `milestoneLine` → "Bring Two Friends." / "Who else should be on this list?" → why (optional) → share (card `<img src="/api/og/signer/<id>?v=<why>">`, copy link, suggested message, X/LinkedIn/Email) → collapsed `<details>` invites. Selfie behind `SHOW_SELFIE_IN_SIGN_FLOW = false` (not deleted). Signer number + slug come from `getMySignatureStatus` after success (`loadSignerNumber`).
- **Returning signer lands on share**: `landOnShareIfSigned(status)` is called from the status fetch, re-affirm and sign-in paths. The old "already signed" view with Delete/Sign out is gone from the modal. `SignedStatus` gained optional `signerId`, `signerNumber`, `whyISigned`, `shareSlug` (filled only by `getMySignatureStatus` in `src/server/actions/me.ts`).
- **Delete vs remove**: `removeMySignature` renamed `deleteMyAccount` (it always was a full cascade). Two-step "Delete my account" now lives on `/account` (`AccountClient.tsx`). Per-version "Remove my signature from vX" keeps the account (`removeMySignatureForVersionAction`). The `/account/revoke` link and page were relabelled to what they do (anonymize), and the signer page's owner link now goes to `/account`.
- **Milestones**: `src/lib/milestones.ts` (100, 250, 500, 1,000, 2,500, 5,000) is the single ladder; `SignatureMomentum.tsx` builds its `GOAL_LADDER` from it, so headline, panel, thank-you step and confirmation email tell one goal story ("9 more to reach 100.").
- **Homepage recognition**: `src/lib/viewer/signature.ts` `getViewerSignature()` (plain module, never throws; only CURRENT-version signers) is computed in `src/app/layout.tsx` and carried in `LiveSignersProvider` (`viewer`, `setViewer`; synced from the prop during render, not in an effect). `SignModal` calls `setViewer` the moment a signature succeeds. Consumers: `LiveSignatureHeadline`/`SignerHeadline`, `FloatingSignButton` (Sign → Share), `LiveSignatureMomentumChip`/`SignerMomentumChip`, `LiveSignerBanner` ("That's you. Welcome, signer #N."), momentum panel chips and `/signers` rows ("You").
- **Short links** (`src/lib/share/short-links.ts`, `src/app/s/[slug]/route.ts`, migration 0014): random 7-char slug per signer in a SEPARATE `share_links` table (never a column on `signers`, because bare `select()`s over signers are what turned 0007 into an outage). Every function returns null instead of throwing; `signerShareLink()` in `urls.ts` falls back to the long link. `/s/<slug>?via=x` → 307 `/signatories/<id>?ref=<id>&via=x`, so `proxy.ts` sets the attribution cookie as before (verified locally with curl).
- **Share host**: `shareOrigin()` in `urls.ts` writes production links on `https://theaibill.org` (redirect verified live to keep path + `?ref`/`?via` and set the cookie); localhost/preview keep their own origin.
- **Invites** (`src/server/actions/invite.ts`, migration 0013 `invitations`): each address (sha256 of normalized email, raw address never stored) is claimed with `INSERT … ON CONFLICT DO NOTHING RETURNING` before sending; skips `already-invited` / `already-signed` (Clerk lookup by email → signer with a signature). New result shape `{ sent: string[], skipped: {email, reason}[], failed: string[] }`. `anonymizeSigner` clears `inviter_signer_id`.
- **Confirmation email** (`src/lib/email/templates.ts`, `sign-from-modal.ts`, legacy `sign.ts`): real first name, "You're signer #N." + milestone, "Bring Two Friends.", short link (long-link fallback).
- **Referrals**: chain traced (share link → theaibill.org redirect → proxy cookie → new signer row). Gap fixed: legacy `/sign/profile` (`profile.ts`) never read the ref cookie; `readReferralAttribution` moved to `src/lib/referral/request.ts` and shared. `tests/server/referral-chain.e2e.test.ts` proves it end to end. `/admin/referrals` (`src/lib/db/referrals.ts`) ranks referrers; tracking starts 2026-09-24.
- **Preview DB** (`ep-bold-cherry…`) was brought up to production's schema (0007–0012, then 0013–0014) for local testing; backup at `~/db-backups/ai-bill-of-rights-preview-20260924-043502.dump`.
- Tests: 1,124 passing. New suites: `sign-modal.thank-you`, `homepage-recognition`, `short-links-and-viewer`, `short-link-route`, `invite.once-per-person`, `referral-chain.e2e`, `admin-referrals.page`, `account-client.delete-and-remove`, `account.remove-signature-for-version`.

### Potential concerns to address:
- **Do not merge until 0013 and 0014 are applied to production and verified** — merging to `main` auto-deploys. Steps are in README "Post-deploy steps" and the PR description. Without 0013 every invitation fails (signing unaffected); without 0014 share links fall back to long links.
- `scripts/apply-migration.ts` mis-splits `DO $$` blocks (beads `ai-bill-of-rights-bpq`); use `psql --single-transaction`.
- `/signatories/<malformed id>` 500s in production (beads `ai-bill-of-rights-2d7`), unrelated to this branch.
- After "Delete my account" the Clerk session stays signed in (same as the old modal behaviour); consider `signOut()`.
- Invitation hash is unkeyed sha256: a known address can be confirmed by hashing a guess. A keyed hash would be stronger but a lost key would break the once-ever guarantee.
- "already-signed" invite check runs before the claim, so it isn't race-safe against someone signing in that instant (harmless: they'd get one invite).
- Pre-existing lint errors (setState-in-effect in SignModal/LiveSignerBanner, `any` in delete/anonymize/invite) are unchanged from `main`; no new ones.

---
