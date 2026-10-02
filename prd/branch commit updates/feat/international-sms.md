# Branch Progress: feat/international-sms

## Progress Update as of 2026-10-02 07:30 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Regenerated `pnpm-lock.yaml` with pnpm 11, the version CI pins, because the first push had a lockfile written by pnpm 10 (local default). That rewrote ~350 unrelated lines (dropped `libc` fields and `supports-color` suffixes) and risked CI's `pnpm install --frozen-lockfile`. The lockfile diff is now 11 lines, all `libphonenumber-js` plus three `deprecated:` notes pnpm 11 records.

### Detail of changes made:
- `pnpm-lock.yaml`: restored from main, then `npx pnpm@11 install --lockfile-only`. Use `npx -y pnpm@11` for any future dependency change; the repo's `pnpm-workspace.yaml` is pnpm 11 format.

### Potential concerns to address:
- A lockfile written by the wrong pnpm major is a quiet way to break CI; worth a `packageManager` field in package.json (not done here).

---

## Progress Update as of 2026-10-02 07:15 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Makes phone sign-in work for international numbers and honest about which countries can get a text. Main cause is outside the code: Clerk only enables SMS for the US and Canada by default. The code side now normalises numbers properly, offers every country, and lets us restrict the list to what Clerk actually allows.

### Detail of changes made:
- `src/lib/phone.ts` (new): `PHONE_COUNTRIES` (all countries from libphonenumber-js metadata, names via `Intl.DisplayNames`, flags from regional-indicator letters; US, CA, GB, AU, MX, IN first), `toE164` (drops trunk 0s, accepts pasted `+`/`00` numbers, uses `isPossible` not `isValid` so a metadata lag cannot lock out a real number), `countryOfInternational`, `formatInternational`, `smsCountries(spec)`, `isSmsSupported` (compares calling codes, like Clerk).
- `src/app/SignModal.tsx`: replaced the 50-country hardcoded list and the `code + digits` concatenation. Dropdown now shows `flag name (code)`. Pasting `+..` switches the country. A real number in a non-SMS country shows "We can't text codes to that country yet. Use email instead." A failed phone start also suggests email.
- `NEXT_PUBLIC_SMS_COUNTRIES` env var (comma-separated ISO codes) restricts the list. Unset keeps all countries.
- README section "SMS codes: which countries work".
- Dependency: `libphonenumber-js`.
- Tests: `tests/lib/phone.test.ts`; existing sign-modal tests pass unchanged (49 pass). tsc and `eslint --max-warnings 0` are clean.

### Potential concerns to address:
- Erika must enable countries in the Clerk dashboard AND set `NEXT_PUBLIC_SMS_COUNTRIES` to match, or the dropdown offers countries Clerk rejects. Unknown which countries are enabled today.
- Returning-signer sign-in by phone uses the same allowlist; someone who signed up with a now-unsupported number is unaffected.
- Clerk's exact error code for a blocked country is unknown; the fallback hint is appended to whatever message Clerk returns. Worth checking the real message once a blocked number is tried.
- The dropdown labels are now wider (8.5rem); not eyeballed on a narrow phone yet.
- Per-SMS cost and fraud risk of enabling many countries is not quantified.

---
