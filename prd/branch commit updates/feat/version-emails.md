# Branch Progress: feat/version-emails

## Progress Update as of 2026-09-26 14:15 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
The "Spread the word" draft has new copy and line breaks. The subject is "I signed The People's AI Bill of Rights. Add your signature." The body is the sentence "I've added my name to The People's AI Bill of Rights, a people's demand for human-centered AI. It just takes a minute. Will you sign too?", then a blank line, the link, and two blank lines at the end so the sender's email signature doesn't sit right under the link. Newlines are CRLF, encoded as `%0D%0A`. **Nothing has been sent to signers.** One test went to Erika only.

### Detail of changes made:
- `src/lib/email/version-email.ts`: `SHARE_DRAFT_SUBJECT` is the new subject. `shareDraftHref` joins `[sentence, "", link, "", "", ""]` with `\r\n`, and `encodeURIComponent` turns each into `%0D%0A`, giving `link%0D%0A%0D%0A%0D%0A` at the end.
- `scripts/send-version-email.ts`: the test-mode log trims whitespace before taking the link, since the body now ends in blank lines.
- Tests: the exact encoded mailto, the decoded body with its line breaks, a check that every newline is encoded as `%0D%0A` with no bare `%0A` and no raw newline, and the bare-site fallback. The campaign test's body assertions use the new ending.
- 1,185 tests pass, `tsc` is clean, and ESLint is clean on every TypeScript file the branch touches.

### Potential concerns to address:
- Some mail apps trim trailing blank lines from a mailto body, so the two blank lines at the end may not survive everywhere. Gmail on the web and Apple Mail are worth checking by hand.
- Erika's signer record still has no short link, so her tests carry `https://theaibill.org` as the link.
- The real send still needs the production `CLERK_SECRET_KEY` for the exact count.

---

## Progress Update as of 2026-09-26 14:00 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
"See the update" now links to the homepage, `https://theaibill.org/?via=email`, and nothing in the email links to `/v/<version>#what-changed` anymore. The relaunch has its new-home line back, "We also have a new home: theaibill.org.", placed after the v0.1.0 paragraph and before the buttons. theaibill.org in that line links to the same tracked homepage URL. **Nothing has been sent to signers.** One test went to Erika only.

### Detail of changes made:
- `src/lib/email/version-email.ts`: `whatChangedUrl` is replaced by `homeUrl` (`${siteOrigin}/?via=email`). The new-home line appears only when `relaunch` is true. In HTML, the host is a blue (#2563eb) underlined link. The plain text keeps the exact wording, with no URL after the host.
- `tests/lib/version-email.test.ts`: the exact-copy test includes the new-home line. New tests check that the line's link is tracked and that it sits between the v0.1.0 paragraph and the buttons, that no "what-changed" remains anywhere, and that version updates don't get the new-home line but do link "See the update" to the tracked homepage.
- 1,184 tests pass, `tsc` is clean, and ESLint is clean on every TypeScript file the branch touches.

### Potential concerns to address:
- The earlier concern "Don't send until #95 is live" was only about the `/v/0.1.0#what-changed` link and the "Add my name" button there. The email no longer links to that page, so it no longer depends on #95.
- `via=email` is also the share-channel value that `?via=` uses for signer-to-signer email shares. Homepage visits from this email carry no `ref`, so no referral is credited, but channel reports will lump them in with email shares unless they're filtered by `ref`.
- The plain-text new-home line has no link. Most clients will autolink "theaibill.org" without the `via` tag.
- The real send still needs the production `CLERK_SECRET_KEY` for the exact count.

---

## Progress Update as of 2026-09-26 13:30 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
The greeting and thank-you are now one line: "Hi Erika, thanks for being signer #N on The People's AI Bill of Rights." With no usable name it's "Hi, thanks for being...". "Spread the word" is now a `mailto:` link with the To field empty. It pre-fills the subject "I signed The People's AI Bill of Rights" and a body ending in the signer's own `theaibill.org/s/<slug>?via=email` link, or `https://theaibill.org` when they have no slug. Test sends now use the tester's own signer record (display name "Erika Anderson" by default) for the number and the link, not the first person in the audience. **Nothing has been sent to signers.** One test went to Erika only.

### Detail of changes made:
- `src/lib/email/version-email.ts`: new `shareDraftHref(shareUrl)` and `SHARE_DRAFT_SUBJECT`. It encodes with `encodeURIComponent`, never `URLSearchParams`, because RFC 6068 reads `+` as a literal plus. It follows the same reasoning as `shareHrefs` in `src/lib/share/urls.ts`, but uses its own subject and body, since that shared `SHARE_EMAIL_SUBJECT` still says "Sign the AI Bill of Rights". The greeting paragraph is gone; "Hi X," now starts the thanks sentence. Without a signer number, it reads "Hi X, thanks for signing ...".
- `src/server/email/campaign.ts`: `renderMessage` passes `signerShortShareUrl(SITE_ORIGIN, slug, "email")` when there's a slug, else `SITE_ORIGIN`. It no longer falls back to the long signatory link, as Erika asked. New `findTestSigner(db, displayName, email)` returns the one signer whose display name matches, ignoring case and extra spaces. It's read-only and throws unless exactly one signer matches.
- `scripts/send-version-email.ts`: test mode calls `findTestSigner` with `--test-signer`, which defaults to the name in `SENDER` ("Erika Anderson"). `--test-name` still sets the greeting. It prints the signer id and the share link used. It still writes nothing (`createShareSlug: false`), so if Erika has no slug yet, her test carries the bare site.
- Tests: `tests/lib/version-email.test.ts` checks the one-line greeting in both forms, the exact mailto (with To empty, the approved subject and body, and no `+`), and the bare-site fallback. `tests/server/version-email-campaign.test.ts` checks the mailto body ends with the created short link and `?via=email`, and the `findTestSigner` match, 0-match and 2-match cases.
- 1,183 tests pass, `tsc` is clean, and ESLint is clean on every TypeScript file the branch touches.

### Potential concerns to address:
- The plain-text part shows "Spread the word:" followed by the whole encoded `mailto:` URL, which is long and hard to read. Most clients render it as a link.
- Some webmail setups don't open mailto links (for example, Gmail in a browser without a mail handler set), so the button can do nothing there. The short link only appears inside the draft.
- `findTestSigner` matches by display name. If Erika renames her signer record, pass `--test-signer`.
- The real send still needs the production `CLERK_SECRET_KEY` for the exact count, and it must wait until #95 is live.

---

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
