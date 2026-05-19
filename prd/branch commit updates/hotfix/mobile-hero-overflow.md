# Branch Progress: hotfix/mobile-hero-overflow

## Progress Update as of 2026-05-19 13:30 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
First entry. Hotfix branch off `main` to fix three mobile-rendering bugs visible at ai-for-people.org on portrait/iPhone viewports: (1) the homepage subtitle "Nine commitments…" was overflowing horizontally because `whitespace-nowrap` was unscoped, (2) the photo-grid hero showed thick black bars/stripes on portrait viewports because the square grid was sized to `100vw` while the sticky container was `100vh`, and the cells were aspect-square inside non-square `1fr` row tracks, (3) the floating Sign button was wrapping the trailing arrow awkwardly. Also includes a polish item the user asked for inline: center cell of the hero photo grid was loading at the `sizes="20vw"` srcset entry and then being CSS-scaled 5×, looking soft on mobile.

### Detail of changes made:
- **`src/app/page.tsx:224`** — Scoped `whitespace-nowrap` to `sm:` so the bold "Nine commitments we're demanding from every AI company" line wraps naturally on mobile and keeps the one-line look on desktop. The unscoped nowrap was added deliberately in commit `522bc25` for desktop polish; this preserves that intent.
- **`src/app/HeroSection.tsx`** — Two changes on the inner grid div:
  - Replaced `w-full` with explicit `width: max(100vw, 100vh)` + `height: max(100vw, 100vh)` so the square grid covers portrait viewports.
  - Added `shrink-0` to prevent the flex parent (`flex items-center justify-center`) from collapsing the grid width back to `100vw`. Without `shrink-0`, the grid was 100vw wide × 100vh tall, `1fr` row tracks were 162px tall, but `aspect-square` cells stayed 78×78 — leaving ~84px of `bg-zinc-900` parent showing between every row at scale=1 (the horizontal black stripes the user reported), and a 420px black gap below the zoomed center cell at scale=5.
  - Center cell now uses `sizes="100vw"` + `quality={90}` instead of the global `sizes="20vw"` + default quality. At scale=5 the center cell renders at ~100vh tall on mobile, so Next.js was previously serving a ~78px-wide source then letting CSS upscale it 5×, which read as low-quality even though the local AVIF is 1200×1601. Webflow CDN does not serve a higher-res variant than what's already in the repo (probed `-p-500/800/1080` all 200, `-p-1600/2000/2600` all 403), so this is the right place to fix it.
- **Sign button cleanup (mobile-rendering scope)**:
  - `src/app/FloatingSignButton.tsx` — Removed the trailing `→`, wrapped "AI Bill of Rights" in `<span className="block sm:inline">` so the floating CTA renders as two lines on mobile ("Sign the" / "AI Bill of Rights") and one line on desktop. Added `text-center` to the small "Join X others who have already signed" pill below the button — it was relying on flex centering of the box, which works for a single line but would left-align on wrap.
  - Removed the trailing `→` from the three other "Sign the AI Bill of Rights" CTAs across the site (`AccountClient.tsx`, `signatories/[id]/page.tsx`, `signers/page.tsx`) so the CTA reads consistently everywhere.

### Verification:
- Started a dev server in the worktree on port 3001 (port 3000 was held by the user's `feat/proposed-tabs-phase-1-schema` dev server) with `.env.local` symlinked from the main checkout so Clerk + Neon credentials resolved. Confirmed visually in iPhone Mini DevTools emulation.
- No DB changes, no migration, no new dependency. Six files modified; diff is 20 insertions / 8 deletions before this progress log.

### Potential concerns to address:
- **Center photo is still resolution-limited at 1200×1601.** Today's change fixes the *sizes hint* (Next.js was unnecessarily downscaling), but the source is still the AVIF Webflow generated from the original upload. If we want it pixel-perfect on a 6.7" retina at scale=5 (~2400 device pixels of width), we need the camera-original from BHT. Mentioned to the user; deferred to a separate task.
- **The PR was scope-expanded mid-flight** (originally just the `whitespace-nowrap` fix). All five included changes are mobile-rendering bugs visible on the same prod page, but anyone reviewing should understand they're four distinct fixes plus one polish item — not a single root cause.
- **Live-signer banner / live-count feature is intentionally OUT** of this PR. The user asked about it during this session and decided to ship those separately so this PR can be reviewed and shipped quickly as a hotfix.

---
