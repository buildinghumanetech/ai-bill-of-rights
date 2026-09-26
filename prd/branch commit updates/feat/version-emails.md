# Branch Progress: feat/version-emails

## Progress Update as of 2026-09-26 13:00 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
The relaunch email now uses Erika's exact copy. The subject is "We've updated The People's AI Bill of Rights: v0.1.0". The greeting uses the first word of the display name, the thank-you line gives the signer number, one paragraph says what v0.1.0 changed, and it signs off "Thanks! Erika". Two pill buttons sit side by side: "See the update" (solid blue) and a new "Spread the word" (white with a 1.5px blue border). "Spread the word" goes to the signer's own short share link, so referrals count. The date line, the "new home" line, the signed-version line, and the plain URL under the button are gone. The gray unsubscribe footer stays. **Nothing has been sent to signers.** One test went to Erika only.

### Detail of changes made:
- `src/lib/email/version-email.ts`, rewritten:
  - The input takes `name` (display name) and `shareUrl`. It no longer takes `publishedAt` or `signedVersion`, and `longDate` is gone.
  - `greetingName()` takes the first word of the name. It returns null ("Hi,") when that word is blank, one letter with or without a period, masked ("E****"), or contains "@".
  - For the relaunch, `summary` is a clause after "which"; for a version update it's the changelog as full sentences ("We've created v0.2.0. Adds ..."). Both use the same subject.
  - The buttons are built by `pill()`/`pillRow()`. Each is a bulletproof table inside an inline-block `div`, so they sit side by side and wrap to a stack when there isn't room for both. There's no media query; on a 375px phone the content width is 327px and the pair needs about 348px. Both pills have a 1.5px blue border and 10.5px by 22.5px padding, so they're the same height (46px).
  - Outlook on Windows gets one table row of two VML roundrects instead: 170px wide for "See the update" and 186px for "Spread the word", at 46px tall. The widths come from measuring Arial Bold 16px (114px and 125px of text), plus 48px of padding and some slack.
- `src/server/email/campaign.ts`: `renderMessage` greets from `recipient.displayName`. It builds the share link with `signerShareLink(SITE_ORIGIN, id, slug)`: `/s/<slug>` when there's a slug, otherwise the long `/signatories/<id>?ref=<id>` link, which also counts referrals. A real send calls `getOrCreateShareSlug`. It takes a new `opts.createShareSlug`; `false` uses the new read-only `findShareSlug` (in `src/lib/share/short-links.ts`), so a dry run or test writes nothing. `Contact.firstName` is gone, and `contacts.ts` no longer reads Clerk's firstName, because the rule is the display name.
- `scripts/send-version-email.ts`: `RELAUNCH_SUMMARY` is now the "which ..." clause. `--test-name` stands in for the display name. The test and dry run pass `createShareSlug: false`.
- There's no site-wide share page (no /share route). When a signer has no slug, the link falls back to their own signer page with `?ref`, which is where `signerShareLink` already sends people.
- Tests: `tests/lib/version-email.test.ts` checks the exact text, the greeting rules, both buttons' styles and links, the side-by-side markup, the VML widths, the footer, and the palette. `tests/server/version-email-campaign.test.ts` checks that a real send creates the slug and links to it, and that `createShareSlug: false` writes no row and uses the long link.
- 1,178 tests pass, `tsc` is clean, and ESLint is clean on every TypeScript file the branch touches.

### Potential concerns to address:
- The test email uses the first audience member's signer number and share link, not Erika's. Clicking "Spread the word" in a test opens that signer's page.
- The real send creates a `share_links` row for any recipient who doesn't have one yet. That's intended, but it's a write the dry run doesn't show.
- Stacking on mobile relies on inline-block wrapping, and I haven't checked it on a device.
- The real send still needs the production `CLERK_SECRET_KEY` for the exact count, and it must wait until #95 is live.

---

## Progress Update as of 2026-09-26 12:30 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
The email's call to action is now one button that says "See the update". It's built like the site's blue pill button, as a table-based bulletproof button with a VML version for Outlook, and a small gray plain-text copy of the link sits under it. The email uses only the site palette: white, near-black #09090b, gray #71717a and blue #2563eb. The unsubscribe pages now say "The People's AI Bill of Rights", and their fallback button is the same blue pill. **Nothing has been sent to signers.** One test went to Erika only.

### Detail of changes made:
- `src/lib/email/version-email.ts`: `VERSION_EMAIL_CTA` is "See the update". It adds palette constants (`INK`, `GRAY`, `BLUE`) and `FONT` ("Geist, -apple-system, Helvetica, Arial, sans-serif"; mail clients rarely have Geist and fall back). The button is a `role="presentation"` table whose cell carries `bgcolor` and radius, around an inline-block link (padding 12px 24px, 16px, weight 600, radius 999px). It's wrapped in `<!--[if !mso]>`, and Outlook gets a `v:roundrect` pill (170x46, `arcsize="50%"`) instead, because Outlook ignores border-radius. The table is `align="left"` and sized to its text. A 13px gray link under it shows the raw URL. The plain-text part reads "See the update:" followed by the URL.
- `src/app/unsubscribe/[token]/UnsubscribeConfirm.tsx` and `page.tsx`: they use the full name in the confirmation text, the home link, and the page title ("Unsubscribe from The People's AI Bill of Rights"). Text is zinc-950 and zinc-500, and the fallback Unsubscribe button is `bg-[#2563eb]` `rounded-full`.
- Tests: `tests/lib/version-email.test.ts` checks the button structure and styles, the VML fallback, the gray link under the button, that every link but unsubscribe goes to what changed, and that the only colors are the four palette hex values. New `tests/app/unsubscribe-confirm.test.tsx` checks the name, the blue pill, no green or purple class in any state, and the title.
- 1,172 tests pass, `tsc` is clean, and ESLint is clean on every TypeScript file the branch touches.

### Potential concerns to address:
- The VML width is a fixed 170px, sized for "See the update". If the label changes, change the width too.
- Other emails in `src/lib/email/templates.ts` (the signing confirmation, for one) still use green (#059669 and #15803d) and say "AI Bill of Rights". They're outside this PR.
- The real send still needs the production `CLERK_SECRET_KEY` for the exact count, and it must wait until #95 is live.

---

## Progress Update as of 2026-09-24 20:00 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
The email now comes from "Erika Anderson <signature@theaibill.org>" instead of ai-for-people.org, because the domain moved and Resend has theaibill.org verified. Reply-To is still erika@buildinghumanetech.com. The email calls the project "The People's AI Bill of Rights" in the subject, the thank-you line, and the footer. The relaunch subject is now "A new version of The People's AI Bill of Rights". **Nothing has been sent to signers.** One new test email went to Erika only.

### Detail of changes made:
- `src/server/email/campaign.ts`: `SENDER` now uses `signature@theaibill.org`. `REPLY_TO` is unchanged.
- `src/lib/email/version-email.ts`: all three mentions of the name (the subject for both the relaunch and version updates, the thank-you line, the footer) now read "The People's AI Bill of Rights". `esc()` does not escape apostrophes, and doesn't need to in HTML text.
- `tests/lib/version-email.test.ts`: a new test pins the relaunch subject and fails if the bare "AI Bill of Rights" appears anywhere in the subject, text, or HTML. `tests/server/version-email-campaign.test.ts` expects the new From.
- The rename is limited to the email. Site pages, including `/unsubscribe/[token]`, still say "AI Bill of Rights". That wording is `SITE_NAME` in `src/lib/site-metadata.ts`, and changing it is a separate decision.
- 1,165 tests pass and `tsc` is clean. ESLint passes on every file this branch touches. Repo-wide `pnpm lint` shows 153 errors in untouched files (mostly `no-explicit-any`), which the earlier "ESLint is clean" note didn't account for.

### Potential concerns to address:
- The unsubscribe confirmation page still says "the AI Bill of Rights", so its wording doesn't match the email. This is minor.
- Earlier concerns still apply: the real `CLERK_SECRET_KEY` is needed for the exact count, and the send must wait until #95 is live.

---

## Progress Update as of 2026-09-24 14:00 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
First commit, and Part 2 of the returning-signers work (Part 1 is PR #95). This adds the version email policy and the one-time relaunch email. Each version in `versions.json` now has a `level` ("major" or "minor"). Emails follow the preference people chose when signing: "major" subscribers hear about major versions, "minor" subscribers hear about both, "none" hears nothing. The relaunch counts as major and goes to people who signed an earlier version but not v0.1.0. It comes from "Erika Anderson <signature@ai-for-people.org>" with replies to erika@buildinghumanetech.com, and carries one call to action plus a one-click unsubscribe. A new table (migration 0015) records every send, so nobody gets a campaign twice. **Nothing has been sent to signers.** Only one test email went out, to Erika.

### Detail of changes made:
- `content/bill-of-rights/versions.json`: `level` on each entry; both 0.0.1 and 0.1.0 are "major". `src/lib/content/versions-index.ts`: `VersionLevel` type; the reader rejects any level other than major or minor. The field is optional to the reader so older fixtures still parse. `tests/lib/content.version-levels.test.ts` requires it on every real entry.
- `src/lib/email/version-policy.ts`: `wantsVersionEmail(preference, level)`.
- `src/lib/email/version-email.ts`: one template for both the relaunch and version updates, plus `longDate()` ("Friday, July 24th"). `tests/lib/version-email.test.ts` enforces the copy rules: no em or en dashes, exactly one CTA, and no wording that suggests a signature expired or needs renewing.
- `src/lib/email/send.ts`: `EmailMessage` gains `from`, `replyTo` and `headers`. New `sendEmailBatch` (Resend batch, at most 100) throws on error, unlike `sendEmail`.
- `src/server/email/campaign.ts` (a plain module): `buildAudience` (read-only; reports each exclusion reason), `renderMessage` (adds the List-Unsubscribe and List-Unsubscribe-Post headers), `sendCampaign` (claims each (campaign, signer) row before sending, releases a failed batch, stops above 2% failures), and `unsubscribeByToken`. `src/server/email/contacts.ts`: Clerk primary email, or for admin-added signers (`admin-added-*`) the consent record's `contact_value` when the admin recorded an email.
- Unsubscribe: `POST /api/unsubscribe/[token]` (RFC 8058 one-click returns 200; the no-JS form gets a 303 back to the page). `/unsubscribe/[token]` POSTs as it loads, then confirms. The GET never unsubscribes, because inbox link scanners fetch links.
- `drizzle/0015_email_sends.sql` plus `emailSends` in `schema.ts`: UNIQUE (campaign, signer_id), UNIQUE unsubscribe_token, and signer FK ON DELETE CASCADE. Idempotent. Listed as pending in the README "Post-deploy steps".
- `scripts/send-version-email.ts`: `relaunch` or `version <x.y.z>`. Dry run by default. `--test-to` sends one email, records nothing and looks up no addresses. `--send` needs `--confirm <exact recipient count>` and 0015 applied. `--env` accepts a comma-separated list.
- Production, read-only, 2026-09-24: 91 signers with a signature. For the relaunch, 1 already signed v0.1.0 and 4 chose "none". That leaves 86 before address lookup (78 "major", 8 "minor"), 3 of them admin-added. One test email went to erika@buildinghumanetech.com.
- 1,164 tests pass; `tsc` and ESLint are clean.

### Potential concerns to address:
- **The exact count still needs the real production `CLERK_SECRET_KEY`.** `.env.production.local` holds a redacted `[SENSITIVE]` value, because `vercel env pull` hides it. Phone-only signers will drop out as "no email".
- **Don't send until #95 is live.** The CTA links to `/v/0.1.0#what-changed` and the page's "Add my name" button, and both come from #95.
- The 2% stop counts send errors only. Bounces arrive later in Resend; watch the Resend dashboard during the real send.
- There's no preference control on /account yet. The only way to opt out afterwards is the unsubscribe link.

---
