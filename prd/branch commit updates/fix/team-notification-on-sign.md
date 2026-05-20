# Branch Progress: fix/team-notification-on-sign

## Progress Update as of [2026-05-19 22:30 Pacific]
*(Most recent updates at top)*

### Summary of changes since last update
First entry on this branch (cut from `main` at 264e48a). Fixes a regression where the team-inbox notification to `hello@ai-for-people.org` stopped firing on real-user signups. The notification block lived only in the legacy `signAction` (`src/server/actions/sign.ts:140-150`), but the SignModal flow that all interactive signers go through uses the newer `recordSignatureFromModal` in `src/server/actions/sign-from-modal.ts`, which only sent the per-signer confirmation. Adds the team notification to the modal action so every new signature pings the team inbox again.

### Detail of changes made:
- `src/server/actions/sign-from-modal.ts`
  - Imported `signerNotification` from `@/lib/email/templates` alongside the existing `signConfirmation` import.
  - Added a module-level `TEAM_NOTIFICATION_EMAIL = "hello@ai-for-people.org"` constant (mirrors the inline string in `sign.ts:147` and the constant in `selfie.ts:186`; using a constant here keeps the destination grep-able when we eventually consolidate).
  - Hoisted the `siteUrl` / `signerPageUrl` derivation out of the confirmation `try` block since both the confirmation and the team notification need it.
  - Added a second `try/catch` after the confirmation-email block that sends the team notification. The block is independent of the confirmation send so a failure on the signer's email (e.g., bounced Clerk address) doesn't suppress the team ping, and vice versa — matches the rationale already documented in `sign.ts:137-139`.
- No template changes — `signerNotification` already exists in `src/lib/email/templates.ts:23-37` and was previously only used from `sign.ts`.

### Potential concerns to address:
- `recordSignatureFromModal` now does up to two sequential Resend API calls in the request path, which slightly extends server time-on-request. Both are wrapped in `try/catch` so they can't fail the signature, but if Resend slows down we'll feel it in the modal close time. If that becomes an issue, both sends are good candidates to move to `waitUntil` (Next/Vercel) or a fire-and-forget queue.
- The admin-add-signer path (`src/server/actions/admin.ts`) does NOT send a team notification — intentional for now, since an admin adding a signer is already aware. If you want admin-added signers to also notify, say the word and I'll add it there too.
- There are no tests covering `recordSignatureFromModal`. Verifying this fix end-to-end depends on a manual signup against the preview deploy.

---
