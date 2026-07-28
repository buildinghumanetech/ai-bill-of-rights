# Branch Progress: sparkle/agent-55904b46-9bee-4d9f-a43d-53aebbfb52f2

## Progress Update as of [2026-07-26 20:45 Pacific]
*(Most recent updates at top)*

### Summary of changes since last update

Closed the last two attribution gaps on the share surfaces and fixed a test that
mocked the very thing it was meant to prove. The invitation email — the
highest-intent share surface on the site — was the only one carrying no
`?ref=`/`?via=` at all, so personally-invited signers were attributed to nobody
while the modal was already reporting `share_clicked{invite}`; a third
hand-rolled copy of the three share hrefs on the signer's own page had drifted
into a broken X link and a mismatched mailto subject; and the root-layout
analytics test mocked `SiteAnalytics` itself, so deleting `<Analytics />` from
inside it left the suite green with the whole funnel discarded. Also removed an
unreachable `try`/`catch` in `landing.ts` and stopped a jsdom clipboard stub
leaking across tests. Suite went from 64 files / 516 tests to 66 / 531, all
passing; `tsc --noEmit` clean.

### Detail of changes made:

- **`src/server/actions/invite.ts`** — `sendInvitationsAction` hand-built
  `` `${siteUrl}/signatories/${inviter.id}` `` and passed the bare `siteUrl`,
  bypassing `src/lib/share/urls.ts` entirely. Now
  `inviterPageUrl: signerShareUrl(siteUrl, inviter.id, "invite")` and
  `siteUrl: homeShareUrl(siteUrl, inviter.id, "invite")`. Both links in this
  email go to the invitee (a third party), so both carry `ref` *and* `via` —
  there is no self-directed link to exempt the way the confirmation email
  exempts its "view my signature" CTA. `"invite"` was already a valid
  `ShareChannel`; nothing in `urls.ts` needed to change.

- **`tests/server/invite.share-attribution.test.ts`** (new, 6 tests) — drives the
  REAL server action with Clerk, the database and the mailer mocked, and asserts
  on the email that actually goes out. A test that compared against
  `signerShareUrl`'s own output would be a tautology and would not catch a
  revert. `invite.ts` reaches for the DB through a lazy CommonJS
  `require("@/lib/db")`, which `vi.mock` does not intercept (CJS resolution
  knows nothing about Vite's `@` alias) — so this patches `Module._load` inside
  a `beforeAll`/`afterAll` pair, the same recipe
  `tests/server/signer-deletion.referrals.test.ts` established. The hook pair
  matters: installed at import time the patch outlives the file whenever
  collection throws, and later suites in the same worker get this file's stub
  back from `require("@/lib/db")`.

- **`tests/lib/email.share-attribution.test.ts`** — added a
  `signInvitation share attribution` block (3 tests) pinning that the TEMPLATE
  ships both tagged URLs through un-mangled and leaves no naked copy beside
  them. Deliberately scoped: the tagging happens at the call site, so the
  regression guard for that is the server test above; the docblock says so
  rather than implying more coverage than the block has.

- **`src/components/ShareSignature.tsx`** — was a THIRD hand-rolled copy of the
  three share hrefs, after the post-sign modal and the confirmation email were
  consolidated onto `shareHrefs`. It had already drifted in two ways that reach
  real recipients: the X href stuffed the URL inside `text=` with no `&url=`
  param (so X had nothing to unfurl and rendered no link card), and the mailto
  subject was `"I signed the AI Bill of Rights"` rather than the shared
  `SHARE_EMAIL_SUBJECT` (`"Sign the AI Bill of Rights"`). Now routed through
  `shareHrefs({ url: (c) => signerShareUrl(siteUrl, signerId, c), text: () => shareText })`.
  `scorecard/[slug]/page.tsx` was left alone — genuinely different shape.

- **`tests/app/share-signature.share-links.test.tsx`** (new, 6 tests) — renders
  the component with `renderToStaticMarkup` and pins the SHAPE of each href (the
  parts a copy is free to get wrong), not the copy inside it.

- **`tests/app/root-layout.analytics-mount.test.tsx`** — the file's whole purpose
  is to catch "written, called, and silently discarded, with a fully green
  suite", and it was reproducing that failure one module down: it mocked
  `@/lib/analytics/SiteAnalytics` with a marker `<div>`, so it pinned only that
  `layout.tsx` renders *a module by that name*. The thing that actually makes
  `track()` non-inert is `<Analytics />` from `@vercel/analytics/next` inside
  `SiteAnalytics.tsx`, and deleting THAT left both assertions green. Now the
  real `SiteAnalytics` renders and the VENDOR is mocked
  (`data-vercel-analytics="mounted"`), so both mutations fail the same
  assertion. `ShareLandingBeacon` returns null and its effect does not run under
  `renderToStaticMarkup`, so the real component renders cleanly with no extra
  stubbing.

- **`src/lib/analytics/landing.ts`** — dropped the `try`/`catch` around the parse.
  `new URLSearchParams(string)` does not throw for any string input (junk is
  parsed into junk pairs, which `parseRef`/`parseChannel` then reject) and the
  `URLSearchParams` branch constructs nothing, so `catch { return null }` was
  unreachable. A guard that cannot fire reads as though a real failure mode is
  being handled. Replaced with a comment saying why there is none.

- **`tests/app/sign-modal.analytics-callsites.test.tsx`** — `stubClipboard`
  installed `navigator.clipboard` via `Object.defineProperty` and never removed
  it. jsdom's `navigator` is one object shared by the whole file, so the
  THROWING stub from the last copy-button test stayed installed for anything
  added after it. Now captures the original descriptor once and restores (or
  deletes) it in an `afterEach`.

- **Mutation verification** (each mutation applied, suite run, then reverted):
  - Reverting `invite.ts` to the hand-built URLs → 4 of the 6 new server tests
    fail.
  - Removing `<SiteAnalytics />` from `layout.tsx` → both root-layout tests fail.
  - Removing `<Analytics />` from inside `SiteAnalytics.tsx` → both root-layout
    tests fail (this is the one the old test missed).
  - Re-inlining the old hrefs in `ShareSignature.tsx` → the X-`&url=` test and
    the shared-subject test fail; the other four still pass, which is correct —
    the `?ref=`/`?via=` tagging never drifted, only the href shape did.
  - Clipboard leak: a temporary probe test appended after the copy-button block
    passes with the `afterEach` and fails without it. Probe removed afterwards.

### Potential concerns to address:

- The invite path still lives in `src/server/actions/invite.ts` under
  `"use server"`. Another worker is moving core logic out of `src/server/actions/*`
  into plain modules; when `invite.ts` moves, the new server test's
  `Module._load` patch and its `@/server/actions/invite` import will both need
  to follow it. The assertions themselves are about the rendered email and
  should survive the move unchanged.
- `tests/server/invite.share-attribution.test.ts` stubs the drizzle chain
  (`select().from().where().limit()`) rather than using the pglite helper, so it
  says nothing about the query being correct — only about what the action does
  with the row it gets. That is the right scope for an attribution test, but it
  means a broken `where` clause here would not be caught by this file.
- The share PITCH text is still duplicated three ways (`SignModal.tsx`,
  `ShareSignature.tsx`, `lib/email/templates.ts`); only the href CONSTRUCTION is
  consolidated. `ShareSignature.tsx`'s comment still flags this. Worth a
  follow-up now that `shareHrefs` exists and takes a `text` resolver.
- `eslint` reports 146 pre-existing errors across the repo (almost all
  `no-explicit-any` in tests, plus `let _db: any` at `invite.ts:10`). None are
  introduced here — every file touched by this branch is otherwise clean — but
  the lint baseline is red, so lint cannot currently gate anything.

---
