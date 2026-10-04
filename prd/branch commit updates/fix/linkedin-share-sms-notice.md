# Branch Progress: fix/linkedin-share-sms-notice

## Progress Update as of [2026-10-04 00:15 Pacific]
*(Most recent updates at top)*

### Summary of changes since last update
Share copy on LinkedIn, X and email now says "The People's AI Bill of Rights" instead of "the AI Bill of Rights". Erika confirmed on the preview that the LinkedIn composer, X and email shares all work.

### Detail of changes made:
- `src/lib/share/share-text.ts`: `GENERIC_SHARE_TEXT`, `LONG_TAIL` and `COMPACT_TAIL` use the full name. X's character budget subtracts the tail length (`overhead`), so the quote is truncated slightly earlier on X automatically.
- `src/lib/share/urls.ts`: `SHARE_EMAIL_SUBJECT` is now "Sign The People's AI Bill of Rights".
- No test changes were needed; share, email and sign-modal suites pass (129 tests).

### Potential concerns to address:
- Other copy still says "the AI Bill of Rights" (confirmation email subject and body in `src/lib/email/templates.ts`, `/signers`, `/signatories/[id]`, `AccountClient`, `ProposedRightCard`, `sign-from-modal.ts`). Not changed here; ask Erika whether to sweep them.

---

## Progress Update as of [2026-10-04 00:00 Pacific]
*(Most recent updates at top)*

### Summary of changes since last update
Rewrote the phone sign-in error per Wix's error-message guidance (what happened, how to fix it, short, no blame). Clerk's raw "is invalid" was being shown with our sentence glued on, which read as gibberish.

### Detail of changes made:
- `src/app/SignModal.tsx`: new exported `phoneStartErrorMessage(err)`. Any phone start failure shows "We couldn't send a text to that number. Check the country and number, or verify by email instead." Rate limits (`too_many_requests`, `form_rate_limited`) keep Clerk's own wording. The always-visible hint under the number field still carries "Text codes aren't available in every country".
- Both inline error boxes (form step, code step) now have `role="alert"`, a border and a leading "!" so the error is not signalled by color alone.
- `tests/app/sign-modal.share-links.test.ts`: two tests for `phoneStartErrorMessage`.

### Potential concerns to address:
- Other Clerk messages on the phone path (wrong code, expired code) are not covered by this helper; the code step still shows Clerk's text.
- The country select truncates long names ("Anguilla (+1264)" shows as "Anguilla (…") on narrow screens.

---

## Progress Update as of [2026-10-03 02:30 Pacific]
*(Most recent updates at top)*

### Summary of changes since last update
First entry. The LinkedIn share button opened a blank page, so every LinkedIn share link now opens LinkedIn's post composer pre-filled with the share text and link. The phone sign-in step now always tells people that text codes are not available in every country and offers email.

### Detail of changes made:
- `src/lib/share/urls.ts` `shareHrefs`: `linkedinHref` changed from `linkedin.com/sharing/share-offsite/?url=...` to `linkedin.com/feed/?shareActive=true&text=<share text + " " + url>`, encoded with `encodeURIComponent` (same no-`+` rule as the mailto). This one builder feeds the post-sign modal, `ShareSignature`, and the confirmation email, so all three changed together.
- `src/app/scorecard/[slug]/page.tsx`: its hand-built LinkedIn href got the same composer form.
- `src/app/SignModal.tsx`: the phone-method hint no longer depends on `NEXT_PUBLIC_SMS_COUNTRIES` being set. It always reads "Text codes aren't available in every country. If your code doesn't arrive, verify by email instead", with a button that switches to email. The phone-start failure message says the same. Removed the now-unused `smsRestricted` and the `PHONE_COUNTRIES` import (lint runs with `--max-warnings 0`).
- Tests updated to read the `text=` param and assert it contains the channel-tagged link: `tests/lib/share-urls.test.ts`, `tests/app/share-signature.share-links.test.tsx`, `tests/app/sign-modal.share-links.test.ts`, `tests/lib/email.share-attribution.test.ts`.

### Potential concerns to address:
- The blank page was NOT reproduced from the sandbox (outbound to the site is blocked). The composer URL is the widely used alternative, but confirm on a real LinkedIn click after deploy. The post-sign modal's "Suggested message" box is still there as a fallback.
- The composer needs a LinkedIn login; logged-out users are sent to sign in first, then may lose the prefilled text.
- Countries still need enabling in the Clerk dashboard and `NEXT_PUBLIC_SMS_COUNTRIES` in Vercel (US,CA,GB,FR,IE), then a redeploy.

---
