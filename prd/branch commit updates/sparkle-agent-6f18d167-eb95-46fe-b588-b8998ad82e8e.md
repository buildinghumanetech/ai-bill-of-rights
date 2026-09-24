# Branch Progress: sparkle/agent-6f18d167-eb95-46fe-b588-b8998ad82e8e

## Progress Update as of [2026-09-24 02:15 Pacific]
*(Most recent updates at top)*

### Summary of changes since last update
Erika corrected the premise: she HAS signed, and she believed she was NOT signed in when she saw "Sign the Bill of Rights first." The gate does not fall through on no session — `requireSigner()` returns early on `!userId`, so that string is only ever sent to a request carrying a live Clerk session with no signer row. She was most likely in a half-created account: Clerk session live, signer insert failed (missing 0007 columns), and `MyAccountButton` hides the account pill for such a user, so it looks exactly like being signed out. This update separates the two states end to end, gives each a working action, and keeps the draft across the round trip.

### Detail of changes made:
- `src/server/actions/proposals.ts`: `requireSigner()` returns `code: "not_signed_in"` (copy never mentions signing the Bill of Rights) or `code: "not_signer"`.
- `src/components/ProposeRightForm.tsx`: `Viewer` = loading | signed-out | no-signer | signer. Signed-out: notice above the fields, primary "Sign in" (opens modal on the sign-in step) plus "Haven't signed yet? Sign the Bill of Rights". No-signer: "You're signed in as <their email/phone>, but this account hasn't signed", "Sign the Bill of Rights", and "Switch account" (`signOut({ redirectUrl: "/propose" })`). Server refusals map by code to the same buttons. Submit while signed out now opens sign-in rather than create-account. A Clerk session change triggers `router.refresh()` so the server-known `needsSignature` stays current.
- Draft: persisted to sessionStorage (`propose-right-draft`), restored after mount (not in the initialiser — hydration), gated on `draftReady` so the empty first render cannot erase it, cleared on successful file. All storage access in try/catch.
- `src/app/SignModal.tsx`: new `startInSignIn` prop sets `signInOnly` on open. `src/app/propose/SignModalClient.tsx`: passes `detail.signIn` through. No other auth-flow change.
- Tests: `tests/components/propose-right-form.signer-gate.test.tsx` (7), 2 new server tests in `tests/server/proposals.mirror-sanitized.test.ts`; licence test mock gains `useUser`/`useClerk`. Full suite 1014/1014, tsc clean. Browser-checked the signed-out notice and the Sign in -> sign-in step on a local preview.

### Potential concerns to address:
- Production 0007/0008 still unapplied (see previous entry) — until then "Sign the Bill of Rights" and first-time account creation still fail server-side.
- `MyAccountButton` hiding for Clerk-without-signer users is what made Erika think she was signed out; it is left as is here, but a site-wide "signed in, not a signer" indicator would prevent the same confusion elsewhere.
- Endorse on `ProposedRightCard` still shows plain error text for these codes.

---

## Progress Update as of [2026-09-24 01:45 Pacific]
*(Most recent updates at top)*

### Summary of changes since last update
Erika was blocked on the live /propose page by "Sign the Bill of Rights first." That message comes from `requireSigner()` in `src/server/actions/proposals.ts`. It refuses any Clerk user with no `signers` row (matched on `clerk_user_id` only). The gate is intended: PR #82 says proposals are "gated only by verified-signer status". This branch keeps the gate. It states the requirement above the compose box and turns the rejection into a button that opens the sign modal. A read-only production check found migrations 0007/0008 were never applied, so every new signer insert fails. The README post-deploy list now says so.

### Detail of changes made:
- `src/server/actions/proposals.ts`: `requireSigner()` now returns `code: "not_signer"` with a clearer message. `submitNewRightAction` passes the code through. The gate logic is unchanged.
- `src/app/propose/page.tsx`: it already looked up the viewer's signer row. It now sets `signedInWithoutSignerRow` when a Clerk user has no row and passes `needsSignature` to the form.
- `src/components/ProposeRightForm.tsx`: new `needsSignature` prop. It renders a `role="status"` notice above the first field with a "Sign the Bill of Rights" button. The button dispatches `open-sign-modal` with `mode: "sign"`, which `SignModalClient` already handles. A `not_signer` rejection after submit shows the same button, and the typed text is kept.
- `tests/components/propose-right-form.signer-gate.test.tsx`: 3 tests. Two failed before the change.
- `README.md`: "Nothing is pending" was wrong. 0007 and 0008 are now listed as pending, with the evidence.

### Potential concerns to address:
- PRODUCTION: `signers.why_i_signed` / `referred_by_signer_id` are missing, so `upsertSignerProfile` (`select()` over every column) throws. Every new signature and new account fails until 0007 and 0008 are applied. The newest signer and signature are both dated 2026-07-09. After the migrations run, the new "Sign" button still cannot help anyone.
- Erika has two signer rows, both admin (one verified by SMS and signed, one verified by email with no signature). The gate still refused her, so the Clerk account she was signed in with is a third account that matches neither row. That account's signer insert most likely hit the missing-column error. This could not be confirmed without Clerk credentials.
- `ProposedRightCard` endorse and other `requireSigner` callers still show a plain error string for `not_signer`. Only the compose form got the button.

---
