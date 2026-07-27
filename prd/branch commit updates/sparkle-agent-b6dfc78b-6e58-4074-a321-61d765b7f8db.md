# Branch Progress: sparkle/agent-b6dfc78b-6e58-4074-a321-61d765b7f8db

## Progress Update as of [2026-07-24 20:15 Pacific]
*(Most recent updates at top)*

### Summary of changes since last update

First entry on this branch. The homepage (`https://ai-for-people.org/`) was serving **zero** Open Graph / Twitter meta tags — `src/app/layout.tsx` exported only `title` and `description` — so every share of the root URL (the one people copy out of the address bar, and the one the `signInvitation` email points at) unfurled as a bare gray link on LinkedIn, X, iMessage, WhatsApp and Slack. This branch adds `metadataBase` + full `openGraph`/`twitter` metadata to the root layout and a new dynamic homepage OG card at `/api/og`, plus tests and a README domain fix.

### Detail of changes made:

- **`src/app/layout.tsx` — `metadata` export only** (surgical; the component body was deliberately left untouched because other workers are editing the JSX in parallel).
  - Added `metadataBase: new URL(SITE_URL)` where `SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://ai-for-people.org"`. Without this, Next 16 resolves the relative `/api/og` image URL against `VERCEL_URL` — a per-deployment `*.vercel.app` host — and logs a build warning. The production fallback matches the convention already used in `src/server/actions/invite.ts` and `src/app/signatories/[id]/page.tsx`.
  - Added `openGraph` (title, description, `url: "/"`, `siteName`, `type: "website"`, `locale: "en_US"`, one 1200x630 image at `/api/og` with alt text) and `twitter` (`card: "summary_large_image"`, same title/description/image).
  - OG title/description are hoisted into `OG_TITLE` / `OG_DESCRIPTION` consts so the `twitter` block cannot drift from the `openGraph` block. The page `description` reuses `OG_DESCRIPTION`, which keeps the canonical "A People's Demand for Human-Centered AI" tagline from `content/bill-of-rights/v0.0.1.md` and appends the nine-commitments hook.
  - The document `title` is intentionally left as `"AI Bill of Rights"` — changing the browser-tab title was out of scope and would ripple into pages that set their own titles.

- **`src/app/api/og/route.tsx` (new)** — dynamic 1200x630 homepage share card via `next/og`'s `ImageResponse`, `runtime = "nodejs"`.
  - Deliberately in the same three-zone visual family as the per-signer card (`src/app/api/og/signer/[id]/route.tsx`): emerald `#059669` banner / white body / amber `#fffbeb` + `#fde68a` CTA footer. It must, however, stand alone for a stranger who has never heard of the document, so the white body carries the **nine article titles** in a 3x3 grid with emerald number badges — the articles are the entire pitch and are scannable in a feed. Short forms live in the `ARTICLES` const; the full titles from `content/bill-of-rights/v0.0.1.md` are too long to fit.
  - Satori (which backs `ImageResponse`) supports only flexbox — no `display: grid` — so the 3x3 layout is three explicit flex rows built from `[0, 3, 6].map(...)` with fixed 344px columns rather than `flexWrap`, which keeps the layout deterministic.
  - **Count framing (`ctaLine`)**: the live count is ~90 today. A bare "90 signatures" reads as counter-proof at that scale and actively discourages the viewer, so below 1,000 the card renders "Be one of the first 1,000 to sign — ai-for-people.org" and never prints the raw number. At/above 1,000 the number *is* the social proof, so it flips to "Join N people who have signed". If you later want the small number visible, change `ctaLine`, not the layout.
  - The `getSignatureCount()` call is wrapped in try/catch and degrades to the static (count-less) card. A 500 from this endpoint would break unfurls on every surface at once, which is strictly worse than a slightly stale card.

- **`tests/app/og-homepage.test.ts` (new)** — mocks `@/lib/db/queries`, invokes the route handler directly, and asserts a 200 with `image/png`, real PNG magic bytes, and >5KB of payload (an empty Satori render would be tiny; the real card is ~66KB). Covers the DB-down path and the ≥1,000 branch.
- **`tests/app/root-metadata.test.ts` (new)** — imports the `metadata` export from the root layout with `next/font/google`, `@clerk/nextjs`, `MyAccountButton`, the DB queries and the live-signer components all stubbed out (calling the Next font loader outside a Next build throws, so mocking it is required). Asserts `metadataBase` is a `URL` on the right origin, the full `openGraph` block including the 1200x630 image, and the `summary_large_image` twitter card.
- **`README.md`** — the opening line advertised **aibillofrights.org**, which is an unrelated Wix site. Corrected to **ai-for-people.org**.

### Verification run:

- `./node_modules/.bin/vitest run` → **39 files / 209 tests passed** (baseline was 37/202; the 7 new tests are the delta, nothing regressed).
- `./node_modules/.bin/tsc --noEmit` → clean.
- `./node_modules/.bin/eslint <changed files>` → clean.
- Rendered the card to a real PNG via a throwaway vitest file: **66,748 bytes**, valid PNG header, and visually inspected — the signer card for comparison is ~40KB.

### Potential concerns to address:

- **Other `aibillofrights.org` references remain.** `content/bill-of-rights/v0.0.1.agents.md`, `docs/superpowers/plans/2026-05-18-phase-1-signable-mvp.md` and `docs/superpowers/specs/2026-05-18-ai-bill-of-rights-design.md` still name the stale domain. Only `README.md` was in scope for this branch; the content/spec files need a separate sweep, and the `.agents.md` one is user-facing.
- **`ctaLine`'s 1,000 threshold is a hard-coded guess.** Once signatures cross ~1,000 the card silently switches messaging. Worth a look at that point to confirm the crossover reads well.
- **Nothing sets `NEXT_PUBLIC_SITE_URL` to production in `.env.example`** (it is `http://localhost:3000` there). The fallback covers production on Vercel, but a misconfigured `NEXT_PUBLIC_SITE_URL` on a preview deployment would put a wrong absolute origin into `og:image` and the unfurl would fetch the wrong host's card.
- **Per-page OG overrides are still absent** on `/v/[version]` and elsewhere. Those pages now inherit this root card, which is a large improvement over nothing, but a version-specific card would convert better.
- **No `title.template`** was added, so pages that do not set their own title show the bare root title. Intentional, but worth revisiting alongside a broader SEO pass.

---
