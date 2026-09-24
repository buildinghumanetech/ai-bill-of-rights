# Branch Progress: sparkle/agent-cdd0e739-b682-45f9-9363-ee32bed05609

## Progress Update as of 2026-09-24 00:30 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Fixes the "propose a new right" flow's "Session already exists" error (Clerk `session_exists`) and lets returning users sign in instead of being pushed through sign-up. The modal's sign-up-only path used to fight people who already had an account or already had a live session; every Clerk call now adopts an existing session instead of failing. There is also an explicit "Already have an account? Sign in" path that asks only for phone or email. Also corrects a false "guarded UPDATE" claim in the 0011 migration header. The migration itself was NOT applied: no database credential is available to this agent.

### Detail of changes made:
- `src/app/SignModal.tsx`:
  - New `clerkErrorCode()` / `isSessionExistsError()` helpers (exported, tested). `session_exists` from `signUp.create`, `signIn.create`, `attempt*Verification` or `attemptFirstFactor` goes to `recoverFromSessionExists()`. That calls `adoptExistingSession()` (`clerk.setActive` on the client's existing session) and then finishes as the signed-in user; the raw Clerk text is never shown.
  - `hasSession()` checks `isSignedIn || clerk.session`. `isSignedIn` is undefined until Clerk loads and lags `setActive` by a render. Both submit handlers short-circuit when a session exists. This is what fixes the likeliest route to Erika's screenshot: the first "Confirm" verified the code and activated the session, the server action then failed, and the retry re-verified against a live session.
  - Post-auth work is unified in `finishAsSignedIn()`, shared by the signed-in shortcut, the OTP path and the recovery path.
  - `signInOnly` state and an "Already have an account? Sign in" / "New here? Create an account" toggle. In sign-in mode, the name, location, name-format and notification fields are hidden and `signIn.create` runs directly. `form_identifier_not_found` sends them back to create-account with a plain message. Button and heading copy follows `flow` ("Enter the code to sign in", "Sign in"), so a sign-in no longer says "Confirm & create account".
  - Sign-in in `mode="sign"` returns to the form (names prefilled from `clerk.user`), because a signature needs the name fields.
- `src/server/actions/sign-from-modal.ts` `createSignerFromModal`: the existing-signer lookup now runs BEFORE the first/last-name validation, so a returning signer who signs in without a name is not refused.
- `src/components/ProposeRightForm.tsx`, `src/components/ProposedRightCard.tsx`: guard on `useAuth().isLoaded`. Undefined `isSignedIn` during load was read as "signed out" and opened the create-account modal on signed-in people. The "sign in first" notice is hidden once signed in (derived at render, not in an effect), and its copy now says "Sign in or create an account".
- `drizzle/0011_new_article_proposals.sql`: header comment only. It claimed a "guarded UPDATE" that does not exist.
- `tests/app/sign-modal.returning-user.test.tsx`: 7 DOM tests covering session_exists recovery at both steps, the retry-after-verify case, the live-session shortcut, sign-in-only, unknown identifier and identifier-exists fallthrough. All 7 were confirmed to FAIL on the pre-change SignModal.

### Potential concerns to address:
- `drizzle/0011_new_article_proposals.sql` is still unapplied in production, so the amber "queue could not be loaded" panel on /propose will stay until someone with DATABASE_URL runs `pnpm tsx scripts/apply-migration.ts drizzle/0011_new_article_proposals.sql` (already listed in README post-deploy steps).
- Not verified end to end in a real browser. This worktree has no `.env.local` (no DATABASE_URL, no Clerk keys). Clerk keyless mode in the sandbox hangs any request carrying Clerk dev-browser state ("Failed to proxy http://localhost:<port>"), and the Sparkle preview server died twice within seconds. Only the first step (signed out, File this proposal, modal opens with the Sign in link) was observed in a browser.
- `adoptExistingSession()` reads `clerk.client.activeSessions`/`sessions`. If Clerk reports session_exists but neither list has one, the user sees "Refresh the page to continue" rather than a silent recovery.
- After signing in from /propose the user still has to press "File this proposal" again. The text is preserved, but there is no auto-submit.
- Two `react-hooks/set-state-in-effect` lint errors in SignModal (the reset-on-close and signature-status effects) predate this branch.

---
