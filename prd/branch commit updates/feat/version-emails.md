# Branch Progress: feat/version-emails

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
