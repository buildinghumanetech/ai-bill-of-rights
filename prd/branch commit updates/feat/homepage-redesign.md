# Branch Progress: feat/homepage-redesign

## Progress Update as of [2026-05-18 18:00 Pacific]
*(Most recent updates at top)*

### Summary of changes since last update
First commit on this branch. Rebuilds the public homepage as a scrolling
one-pager with a 3×3 image-grid hero effect, adds a custom signing modal
that drives Clerk OTP under the hood (so users never see Clerk's UI), adds
a `/signers` table view, and ships a minimal `/admin/signers` panel for
deleting signers and granting admin to others. Branched off `main` at
`3f3bb03` (the Phase 1 merge) so the Phase 2 work-in-progress on
`feat/phase-2-as-code-attestations` is not affected.

### Detail of changes made:
- **Homepage (`src/app/page.tsx`)** rewritten as a server component:
  - Above-the-fold title section with "The AI Bill of Rights" + a two-line
    subtitle. The "Nine commitments…" line is bold; the second line has
    "**[N] signatures**" as a bold-blue link to `/signers` (live count via
    `getSignatureCount`, falls back to 0 if DB is unreachable).
  - Nine article entries laid out with mono numerals, semantic headings,
    body prose, and pull-quote blockquotes for the punchy lines (e.g.
    "The default is no.").
  - Closing CTA section links to `/v/1.0.0/as-code`.
  - All `force-dynamic` so the count + admin DB lookups always reflect
    current state.
- **`src/app/HeroSection.tsx`** (new, client component): the 3×3-grid
  scroll effect inspired by buildinghumanetech.com. Section is 220vh
  tall so the inner sticky div pins for ~120vh of scroll. A scroll
  listener (rAF-throttled) maps `scrollY` to a 0→1 progress value driven
  by the section's `getBoundingClientRect().top`. The hero overlay image
  animates from filling the whole sticky container to occupying the
  center cell (`top/left: 33.33%, size: 33.33%`); the other 8 grid cells
  fade in from 0→1 opacity. An ease-out is applied to the progress to
  soften the landing. Critical: parent of `<Image fill>` must have
  `position: absolute|fixed|relative` — using `sticky` for a fill parent
  causes Next/Image to refuse to render. Tripped over this; the current
  layout splits the sticky scope from the fill-host scope to avoid it.
- **`src/app/FloatingSignButton.tsx`** (new, client component): the
  always-visible floating CTA. Blue gradient pill with `backdrop-blur` +
  `glass-button` box-shadow (glassmorphic). Below it, "Join [N] others
  who have already signed" with the bold-blue `[N] others` linking to
  `/signers`. Opens `<SignModal>` on click.
- **`src/app/SignTrigger.tsx`** (new, client component): reusable click
  target that opens `<SignModal>`. Used on the `/signers` empty state
  ("Be the first to sign →") so any future "sign" CTA can share state.
- **`src/app/SignModal.tsx`** (new, client component): the custom signing
  flow. Renders form (first/last name, Email↔Phone slider toggle,
  conditional identifier input, pre-checked "Share my approximate city &
  state" checkbox, green Sign button). Drives Clerk programmatically via
  `useSignUp()` / `useSignIn()` so the user never sees Clerk's hosted
  modal. On submit:
    1. Tries `signUp.create()`. On `form_identifier_exists`, falls back to
       `signIn.create()` (returning visitors).
    2. Prepares email or phone verification per the chosen method.
    3. Transitions to OTP step (custom 6-digit input with copy "Enter the
       code you received to confirm your signature").
    4. On `attemptVerification` complete → activates session → calls
       `recordSignatureFromModal()` server action to persist.
    5. Shows "Thank you" success state.
  Surfaces Clerk's `status` + `missingFields` + `unverifiedFields` in the
  error path so misconfigured Clerk apps are debuggable (we discovered
  Clerk required `email_address, password` by default until the dashboard
  was reconfigured for OTP-only).
  Important: also detects existing Clerk session via `useUser()` and
  skips OTP entirely if `isSignedIn` — server action just attaches the
  signature to the current account. Shows a "Signed in as X — use a
  different account" banner so testing with multiple identifiers is
  cleaner. Includes `<div id="clerk-captcha" />` for Clerk v6's required
  CAPTCHA element.
- **`src/server/actions/sign-from-modal.ts`** (new server action):
  end-to-end signer + signature creation in one call from the modal.
  Reads `auth()` for the Clerk user ID, builds `displayName` from
  `firstName lastName`, extracts captured fields via
  `extractCapturedFields(headers, ...)`, and — if the user opted in —
  builds `locationText` from `x-vercel-ip-city / -country-region /
  -country`. Upserts the signer profile, renders + hashes the consent
  text (`renderConsentText` + `sha256Hex`), records the signature, then
  fires the Resend confirmation email (best-effort; errors logged but
  don't block). Returns `{ success, error?, alreadySigned? }` so the
  modal can show the right message; duplicate-key errors are translated
  into `alreadySigned: true`.
- **`src/server/actions/sign.ts`** modified: removed
  `db.transaction(async tx => ...)` wrapping in `recordSignature()`.
  Neon's HTTP driver does **not** support transactions — Phase 1's tests
  pass because pglite does, but live signing was crashing with
  "No transactions support in neon-http driver". Now inserts
  consent_records first, then signatures; an orphan consent row on
  rare failure is acceptable and recoverable by a sweep job. Atomic
  semantics would require switching to `drizzle-orm/neon-serverless`
  (WebSocket driver) — out of scope for this PR but flagged in a code
  comment for whoever picks it up.
- **`src/app/signers/page.tsx`** (new, server component): public table
  view of all signers. Columns: Signer (name formatted "First L.",
  affiliation underneath, Clerk-ID hidden), Location (free text from
  `signers.location_text`), Verification (Email Verified / Phone
  Verified pill with checkmark icon), Signed (version + date).
  De-dupes results by signer ID since `listSignatures()` returns one
  row per signature. Empty state uses `<SignTrigger>` so "Be the first
  to sign →" opens the same modal as the floating button.
- **Admin panel:**
  - `src/lib/admin/check.ts` — `getCurrentAdmin()` returns a tagged
    union of `{state}`: `unauthenticated | not-a-signer | no-admins-yet
    | not-admin | admin`. The `no-admins-yet` state implements the
    bootstrap path: when zero rows have `is_admin=true`, any signed-in
    signer can self-promote (otherwise admins must grant it).
  - `src/server/actions/admin.ts` — three server actions:
    `bootstrapAdminAction` (only valid in `no-admins-yet` state),
    `deleteSignerAction` (cascades `signatures` → `consent_records` →
    `signers` since neon-http can't transact), `setAdminFlagAction`
    (toggle `is_admin`). All gated by `requireAdminOrBootstrap()`.
  - `src/app/admin/page.tsx` redirects to `/admin/signers`.
  - `src/app/admin/signers/page.tsx` (server component) — calls
    `getCurrentAdmin()`; renders 404 for non-admins/non-signers/anon
    users; renders the bootstrap CTA for `no-admins-yet`; renders the
    full table for admins. Table shows Name + affiliation +
    `clerk_user_id` (visible to admins only for debugging), Location,
    Method, Role badge (Admin/Signer), Joined date, Actions column.
  - `src/app/admin/signers/AdminRowActions.tsx` (client component) —
    wraps each row's "Make admin/Revoke admin" toggle + "Delete" button
    in `useTransition` for inline pending state. Delete has a
    `window.confirm()` guard.
- **`src/app/globals.css`**: added `.glass-button` utility class
  (box-shadow combo giving the blue button its glow + inset highlight).
  Removed the earlier `sparkle-button` pulse/shimmer animations after
  the user asked for a calmer look.
- **`public/images/bht/`** (35 new images): every image referenced on
  https://buildinghumanetech.com/ pulled down to `public/` for the hero
  grid + future visual reuse. URLs were grepped out of the page HTML
  and downloaded via curl. Only one (`...IMG_9691.webp` — the
  whiteboard "Principle 1, Principle 2" photo) is currently
  load-bearing as the center hero image; the other 8 in the 3×3 grid
  are arranged around it. The unused images are kept in the same
  directory so we can swap them in by changing one path in
  `HeroSection.tsx`'s `IMAGES` array.
- **Environment & infra (not in commit):**
  - `RESEND_API_KEY` set in local `.env.local` (and verified working —
    test send to `drodio@gmail.com` returned a valid Resend id).
  - `RESEND_FROM_EMAIL` set to `AI Bill of Rights
    <signature@ai-for-people.org>`; domain verified in Resend after
    Cloudflare DNS records were added.
  - Vercel production env vars **not yet pushed** — the in-session
    `vercel env add` calls got blocked by sandbox; user will run them
    in their shell.
  - Clerk dashboard reconfigured to OTP-only by turning off "Require
    email address" and the password requirement; otherwise Clerk
    refused to complete phone-only sign-ups with
    `missing_requirements: email_address, password`.

### Potential concerns to address:
- **No atomic writes to `signatures` + `consent_records`.** If the
  `signatures` insert fails after a successful `consent_records` insert
  (rare — usually only on unique-constraint double-submit, which we
  already special-case), an orphan consent row is left behind. Long
  term, switch to the neon-serverless WebSocket driver so
  `db.transaction()` works, or build a sweep job that deletes
  consent_records with no matching signatures older than ~5 min.
- **"Add user" admin action is not implemented.** The user asked for
  add + delete + promote — only delete + promote shipped. Add requires
  synthesizing a `clerk_user_id` (column is `text not null unique`),
  which is doable but felt out-of-scope for this PR. Easiest path
  when added: insert with `clerk_user_id = 'admin-added-' + uuid`,
  flagged in `verification_method` or via a new column so the public
  signers view can distinguish them.
- **The 3×3 grid hero uses identifiable photos of real people** from
  buildinghumanetech.com. Whether Erika & her team are OK with their
  faces being on the front door of `ai-for-people.org` is a content
  decision, not a code one — swap-ready via the `IMAGES` array in
  `HeroSection.tsx`.
- **Phase 2 (as-code + attestations) is now merged to `main` while
  this branch was open** — the other agent has moved on to
  `feat/phase-3-comments-upvotes-moderation`. This PR will likely
  conflict on `src/app/page.tsx` (Phase 2 added an "Implement in your
  code" link below the title). Plan to rebase or resolve at PR review.
- **Hydration mismatch on `<body>` element** (cosmetic) — a browser
  extension (Storytell) injects `style="min-width:25vw;width:100%"`
  after React loads. Not from our code; surfaces as a dev-mode console
  warning only.
- **`extractCapturedFields` reads `x-vercel-ip-*` headers** which only
  exist on Vercel deployments. Locally those fields will be empty
  strings, so opting in to "Share city & state" on `localhost:3001`
  records an empty `locationText`. Will populate correctly once on the
  preview deploy.
- **Push to remote not yet done** (this entry being written ahead of
  the actual commit-and-push so the log is staged in the same commit
  per CLAUDE.md).

---
