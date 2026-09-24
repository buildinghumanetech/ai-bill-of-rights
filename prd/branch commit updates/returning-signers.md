# Branch Progress: returning-signers

## Progress Update as of 2026-09-24 10:00 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
First commit. Follow-up to PR #94 (post-sign share view), tracked as beads `ai-bill-of-rights-9u6`. Anyone who has signed ANY version is now treated as a signer: they land on the share view ("You're signer #N. Thank you."), and the blocking "You've already signed… Add my name to v0.1.0" modal panels are gone. Someone who signed only an earlier version sees an optional "v0.1.0 is out. See what changed." line in the modal and under the homepage headline. The only on-site way to re-sign is a quiet "Add my name to v0.1.0" button at the bottom of /v/0.1.0. /v/<version> now opens with a "What changed in vX" note from `versions.json`, and "Archive view" shows only on past versions. Rebased onto main after #94 merged (`92ef0ed`); no conflicts.

### Detail of changes made:
- **Base:** first built on #94's tip because everything here edits #94's code, then rebased onto main (`92ef0ed`, #94 merged) with `git rebase --onto origin/main c79893f`. Tests, `tsc` and lint were re-run after the rebase; results were unchanged.
- **Viewer** (`src/lib/viewer/signature.ts`): `getViewerSignature` no longer filters to `versions.isCurrent`. `ViewerSignature` gains `newVersion: string | null`, which holds the current version when the viewer hasn't signed it (null once they have). `LiveSignersProvider`'s viewer key includes it, so a refresh after re-signing clears the line.
- **Homepage** (`SignatureCount.tsx`, `SignatureMomentum.tsx`): `SignerHeadline` takes `newVersion` and renders the new `NewVersionLink` (a span, so it fits inside the hero `<p>`). Links go to `/v/<version>#what-changed`.
- **Modal** (`src/app/SignModal.tsx`): removed the `signed-earlier`, `signed-other` and `signed-version-unknown` panels, plus `handleReaffirm`, `reaffirming` and `formatSignedDate`. New `isSignedStatus()` helper. `landOnShareIfSigned` accepts every signed state and sets `newVersion` only for `signed-earlier` (the one state with a newer version open for signing). `setViewer` carries `newVersion`. If `recordSignatureFromModal` answers `alreadySigned`, the modal fetches status and lands on share instead of showing an error.
- **Status types** (`src/lib/db/signature-status.ts`): the share fields (`signerId`, `signerNumber`, `whyISigned`, `shareSlug`) moved into `SignerShareFields`, which all four signed states extend. `getMySignatureStatus` (`src/server/actions/me.ts`) fills them for every state except `not-signed`.
- **No re-sign from the form** (`src/server/actions/sign-from-modal.ts` + new `src/server/signatures/has-signed.ts`): `recordSignatureFromModal` returns `{ success:false, alreadySigned:true }` for anyone who has signed any version. The check runs *before* `upsertSignerProfile`, so a retyped name can't overwrite the one they signed under. This closes the path where an earlier signer, not signed in on this browser, filled in the form and silently signed v0.1.0.
- **/v/[version]** (`page.tsx`, new `AddMyNameButton.tsx`, new `src/lib/content/changelog.ts`): the button renders only when `row.isCurrent && viewer.newVersion === row.version`. The viewer isn't looked up on past versions. The button calls the existing `reaffirmMySignature`, clears `newVersion` via `setViewer`, and runs `router.refresh()`. `changelogFor()` statically imports `versions.json` (not `readVersionsIndex()`, which reads from `process.cwd()` at request time and may not be bundled) and returns null for the first version.
- **Tests:** 1,148 pass (was 1,124). New: `tests/app/version-page.test.tsx`, `tests/app/add-my-name-button.test.tsx`. Extended: `sign-modal.thank-you` (earlier-version signer lands on share with the link, and form fill doesn't re-sign; signed-other/unknown get no link), `homepage-recognition`, `short-links-and-viewer` (viewer for any version, `newVersion`, `hasSignedAnyVersion` on pglite), `sign-from-modal.attribution` (already-signed writes nothing and sends no email). `tsc` is clean, and ESLint shows no new findings on the changed files.

### Potential concerns to address:
- **Not yet clicked through live.** No local env with the preview DB and Clerk test keys exists in the worktree. The only env file found locally is `.env.production.local`, which was deliberately not used. Do this before opening the PR.
- Legacy `/sign/profile` → `/sign/consent` (`src/server/actions/sign.ts`) can still re-sign an earlier signer by URL. Nothing links to it. Tracked as beads `ai-bill-of-rights-zu3`.
- `SignModal`'s `VERSION = "0.1.0"` is still hardcoded. With a future version bump, `newVersion` comes from the DB (viewer) and from `requestedVersion` (modal), so the copy follows the DB, but the modal still asks about the constant.
- `tests/app/version-page.test.tsx` asserts on the real 0.1.0 changelog text ("Adds Article 10"). Editing that changelog means updating the test.
- The "form fill doesn't re-sign" modal test can't tell which of the two paths (post-sign-in status fetch, or `alreadySigned`) put the user on share. It checks the outcome. Server-side, the attribution test proves nothing is written.
- No migrations.

---
