# Branch Progress: sparkle/agent-4e21315a-141f-4da4-adf3-27bff3605d1b

## Progress Update as of [2026-07-25 09:00 Pacific]
*(Most recent updates at top)*

### Summary of changes since last update

First entry on this branch. The analytics and share-attribution layer existed on paper and measured **nothing**: `<Analytics />` was never mounted (so `track()` from `@vercel/analytics` was a no-op on every page), the five funnel helpers in `src/lib/analytics/` had **zero call sites**, the confirmation email — which goes to 100% of signers — sent every share link out with `?via=` but **no `?ref=`** because neither call site passed `signerId`, and the `via` channel cookie was written by the proxy and never read by anything. This branch closes all four gaps: mounts the vendor script via a new `SiteAnalytics` client boundary, wires `share_link_landed` / `sign_modal_opened` / `sign_form_submitted` / `signature_completed` / `share_clicked` to real call sites, tags every link in the confirmation email, and reads the channel cookie back at signing time so "which surface converts" is finally answerable.

### ⚠️ Read this before trusting any channel-conversion number from before this commit

Every channel-conversion figure recorded prior to this commit is **actively misleading, not merely incomplete**. Email and X will read as "barely converts" purely because those links were never tagged — the confirmation email carried no `?ref=` at all, and nothing was ever mounted to receive the events in the first place. Treat the series as starting fresh from this commit; do not compare across it.

### Detail of changes made:

- **`src/app/layout.tsx` + `src/lib/analytics/SiteAnalytics.tsx` (new)** — the root cause of "it measures nothing".
  - `@vercel/analytics`'s `track()` is a silent no-op unless the vendor script was injected, so without `<Analytics />` on the page every event the site emits is written, called, and discarded. `SiteAnalytics` is a `"use client"` component that renders `<Analytics />` (from `@vercel/analytics/next`, which is itself `"use client"`) and is mounted once at the top of `<body>`.
  - Kept as a separate component rather than making the layout a client component, per the App Router analytics guide in `node_modules/next/dist/docs/01-app/02-guides/analytics.md`: *"the most performant approach is to create a separate component that the root layout imports"* — it confines the client boundary to the beacon. (Note: `node_modules/next/dist/docs/` is only present in the pnpm store copy, under `node_modules/.pnpm/next@16.2.6_*/node_modules/next/dist/docs/`.)
  - `ShareLandingBeacon` inside it fires `share_link_landed`. It reads `window.location.search` in a `useEffect` **rather than `useSearchParams()` on purpose**: the hook opts its whole subtree out of static generation unless individually wrapped in Suspense, which is a steep price to pay for an analytics beacon. It only fires when the URL actually carried a `ref` or `via` — firing on every pageview would drown the signal.

- **`src/lib/email/templates.ts` — `signConfirmation`, the highest-volume share surface on the site.**
  - Removed the `whyISigned` param. It was a promise the template could never keep: this email is sent the instant the signature lands, and the "why I signed" statement is captured on the step *after* that, so it was null for every signer on every send. A param that silently does nothing is worse than no param. `shareTextFor(channel)` now calls `buildShareText({ channel })`.
  - Deleted the dead `const shareUrl` binding and replaced it with `ownPageUrl = shareUrlFor("confirmation-email")`, now actually **used** by the two links that were still bare `opts.signerPageUrl`: the plain-text "View your public signature page" line (~line 86) and the "View My Signature" HTML CTA (~line 139). A signer clicking through from the email body is a share-surface click; it gets its own `confirmation-email` channel so a self-click can never be miscounted as an X or LinkedIn conversion.
  - The `?ref=` behaviour when `signerId` is null is unchanged and deliberate: `withShareParams` strips rather than inherits, so an unattributed send yields `?via=x` with no ref instead of crediting whoever was last in the URL.

- **`src/server/actions/sign.ts` (~line 135) and `src/server/actions/sign-from-modal.ts` (~line 226)** — both now pass `signerId` (`signer.id` / `profile.id`) into `signConfirmation`. This is the single largest attribution fix here: before it, 100% of confirmation emails went out untagged.

- **`src/server/actions/sign-from-modal.ts` — reading the `via` cookie (`readChannelCookieValue` previously had no callers).**
  - `readRefCookie()` → `readReferralAttribution()`, which returns `{ ref, channel }` and reads `REF_COOKIE` and `REF_CHANNEL_COOKIE` **from the same jar in one call**, because the pair always describes the same share event — reading them separately would let a retry pick up a ref from one moment and a channel from another.
  - Follows the existing best-effort pattern exactly: the whole read is in a try/catch that returns `{ ref: null, channel: null }` and warns. The governing rule of this feature is **ATTRIBUTION MUST NEVER COST US A SIGNATURE**, and there is a test that throws from the cookie jar and asserts the signature still lands.
  - `SignFromModalResult` gained `referred?: boolean` and `channel?: string | null`. These have to come back from the server because the cookies are `httpOnly` — the browser cannot work either out for itself. Deliberately **not** the signer id: per the privacy note at the top of `src/lib/analytics/track.ts`, we never send a signer id to the vendor; "who referred whom" is a database question (`countReferralsBySigner`).
  - Attribution is resolved once, up front, so the same pair feeds the `referredBySignerId` database write and the analytics event and they can never disagree.

- **`src/lib/analytics/track.ts`** — `trackSignatureCompleted` gained `channel`. Nullable and stripped by `clean()` when absent, so a visitor who typed the URL doesn't create an "unknown" bucket that means two different things.

- **`src/app/SignModal.tsx`**
  - Extracted `buildPostSignShareLinks({ origin, signerId, whyISigned })` as an **exported pure function** returning `{ shareUrl, twitterHref, linkedinHref, emailHref, suggestedMessage }`. It was already going through `signerShareUrl` (an earlier commit on the parent branch had migrated it — the hand-built `twitter.com/intent` / `linkedin.com/sharing` / `mailto:` URLs described in the task were already gone), but it was inline in the component body and therefore untestable without driving a Clerk-backed component through three steps of state. Exporting it is what makes `tests/app/sign-modal.share-links.test.ts` possible. Returns inert `""`/`"#"` until both the signer id and the origin exist, so a half-built link is never rendered as a real one (`origin` is empty during SSR).
  - Call sites wired: `sign_modal_opened` (effect on `open`, `source: mode`), `sign_form_submitted` (top of `handleFormSubmit`, sign mode only), `signature_completed` via a single `reportSignatureCompleted()` helper called from **both** success paths — the already-signed-in shortcut in `handleFormSubmit` and the post-OTP path in `handleCodeSubmit` — and `share_clicked` on all five surfaces (copy, X, LinkedIn, email, and `invite` on a successful invitation send with `sent > 0`).
  - Everything is fire-and-forget: `track()` swallows its own errors, so none of this can turn a completed signature into a failed one.

### Tests added (all four files fail without the corresponding change — verified red first):

- **`tests/lib/email.share-attribution.test.ts` (8 tests)** — pins that `signConfirmation` output carries `ref=<signerId>` and the right `via=` on the X, LinkedIn, email, plain-text and HTML-CTA links; that **no untagged bare signer-page URL survives anywhere** in either body; that a null `signerId` degrades to channel-only; and a regression guard that the `mailto:` body contains `%20` and never `+`.
- **`tests/server/sign-from-modal.attribution.test.ts` (5 tests)** — drives the real `recordSignatureFromModal` with `next/headers`, Clerk, the profile/sign actions, the queries and `sendEmail` all mocked, then asserts on the email that actually goes out and on the reported `referred`/`channel`. Includes the junk-channel case and the cookie-jar-throws case.
- **`tests/app/sign-modal.share-links.test.ts` (8 tests)** — pins ref+via on all four modal share URLs, the mailto `+` guard, the whyISigned lead-in, and both inert cases.
- **`tests/lib/analytics.track.test.ts` (5 tests)** — payload shapes via `setAnalyticsSink`, including that a throwing sink never escapes into the caller.

### Verification run:

- `./node_modules/.bin/vitest run` → **53 files / 362 tests passed**, 0 failures. Baseline before this work was 49 files / 336 tests; the 4 new files / 26 new tests are the entire delta.
- `./node_modules/.bin/tsc --noEmit` → clean, no output.
- `./node_modules/.bin/eslint` on the six touched files → 6 errors, **all pre-existing and all in code this branch did not touch**: two `react-hooks/set-state-in-effect` in `SignModal.tsx` (the reset-on-close and signature-status effects) and four `no-explicit-any` / `no-require-imports` in the `getDb()` block at the top of `sign.ts`.

### Potential concerns to address:

- **Baseline flakiness, not caused by this branch.** On the first baseline run, `tests/server/selfie.report.test.ts` and `tests/server/selfie.submit.test.ts` both failed with `Test timed out in 15000ms` while a `pnpm install` was running concurrently. Both pass on an unloaded machine. The pglite-backed server tests are slow enough (`db.sync.test.ts` alone takes ~21s) that the global 15s `testTimeout` in `vitest.config.ts` is uncomfortably tight and will bite again in CI.
- **`next build` cannot be run in this environment**, so the build was not verified end to end. Compilation succeeds and it reaches the prerender phase, but `/_not-found` then fails with `@clerk/clerk-react: Missing publishableKey` and `DATABASE_URL is not set` — there is no `.env.local`, only `.env.example`. This is environmental and predates the branch, but it does mean `<Analytics />` has only been verified to compile, not to render in a real build.
- **`share_link_landed` fires from a mount effect**, so it counts one arrival per full page load. A client-side soft navigation to another attributed URL within the same session will not re-fire it. That is the intended semantic ("landed"), but it is worth knowing before comparing it against a pageview count from the vendor dashboard.
- **`sign_form_submitted` fires before the Clerk call, not after.** It measures intent to submit, so it will slightly over-count relative to "OTP was actually sent" if Clerk rejects the identifier. Moving it after the `signUp.create()` would measure something different and arguably less useful (it would exclude exactly the users who hit friction), but the drop-off from this step to `signature_completed` should be read with that in mind.
- **The other half of the funnel is still uninstrumented.** `src/components/ShareSignature.tsx` and `src/app/signatories/[id]/page.tsx` are the signer-page share surface and are owned by other workers on this branch; they carry no `share_clicked` call, so `surface: "signer-page"` will never appear in the data until someone wires it. Same for any share affordance on the homepage.
- **`createSignerFromModal` (comment-only accounts) reports no attribution.** It reads the ref for the database write but does not return `referred`/`channel`, and no analytics event fires for it. That was a deliberate scope call — a comment-only account is not a signature and should not enter the signature funnel — but if account creation ever becomes a tracked conversion, that is the gap.

---
