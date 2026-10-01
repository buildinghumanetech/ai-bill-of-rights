# Branch Progress: hotfix/sign-modal-current-version

## Progress Update as of 2026-10-01 12:00 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Fixes a production outage: after the v0.1.1 publish nobody could sign. `SignModal` (and a few server defaults) hardcoded `"0.1.0"`, and `recordSignature` rejects archived versions, so the final OTP step showed "Version 0.1.0 is no longer open for signing." The current version now comes from the DB, and a test guards against reintroducing a literal.

### Detail of changes made:
- `src/app/layout.tsx` reads `getCurrentVersion()` and passes `currentVersion` to `LiveSignersProvider` (`src/app/LiveSignersProvider.tsx`, new context field).
- `src/app/SignModal.tsx`: removed `const VERSION = "0.1.0"`. It now uses the optional `version` prop, else the provider's `currentVersion`, else `""` (which fails loudly server-side as "Unknown version" instead of signing against a stale literal).
- `src/app/admin/signers/AdminAddSignerForm.tsx` takes `version` from its server page.
- `/sign/profile|consent|complete` pages, `src/server/actions/profile.ts`, and `getMySignatureStatus` in `src/server/actions/me.ts` default to the current DB version instead of `"0.1.0"`.
- `tests/lib/no-hardcoded-signing-version.test.ts` fails if any signing-path file contains a semver string literal.
- `README.md`: added a mandatory "prove signing works on production" step after every publish; marked 0015 as applied (2026-09-30).
- Why this slipped: the v0.1.1 PR passed unit tests (they mock the modal's actions) and my post-deploy check looked at the page, not the sign flow's last step.

### Potential concerns to address:
- Other `"0.1.0"` literals remain as DB-unreachable fallbacks (`bill-of-rights/page.tsx`, `propose/page.tsx`, `load-tab-data.ts`). They only fire if the DB read fails, but are worth a later look.
- No automated end-to-end sign test exists. The README check is manual; an e2e smoke against a preview deploy would be the real fix.
- People who hit the error between the v0.1.1 deploy and this fix were not signed; they need to retry.

---
