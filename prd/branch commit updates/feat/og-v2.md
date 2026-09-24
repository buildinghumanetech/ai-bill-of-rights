# Branch Progress: feat/og-v2

## Progress Update as of 2026-09-24 14:15 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
First commit. There's a new link preview: `public/og-v2.png` (the supplied card, byte-identical to `~/Downloads/og-ours-voice-heard.png`, 1200x630) is now og:image and twitter:image (summary_large_image) on every page that used the old generated card. The site title and og:title are "The People's AI Bill of Rights". The description is "The future is ours to name. Make your voice heard. Sign at theaibill.org". Link-preview metadata has no em dashes. The old `/api/og` image and the two scorecard card routes are removed, because they said "ai-for-people.org" (and "first 1,000"). No migrations, and no visible heading changes (that's the separate restyle PR).

### Detail of changes made:
- `src/lib/site-metadata.ts`:
  - `SITE_TITLE` is now "The People's AI Bill of Rights". It's used for the root title, og:title, twitter:title and og:site_name, and as the suffix on subpage titles, whose separator is now " | " instead of " — ".
  - `SITE_DESCRIPTION` is the new line.
  - `OG_IMAGE_URL = "/og-v2.png"`, with alt text matching the card. Twitter images now carry width, height and alt too.
  - New `withoutEmDashes()`: `buildPageMetadata` applies it to titles and descriptions, because 11 resource titles and subtitles in `content/resources/` contain em dashes.
  - The `appendSiteName:false` check now looks for `SITE_TITLE`.
  - `SITE_NAME` / `SITE_TAGLINE` are unchanged. They're still used for visible body copy (the homepage hero, and the scorecard heading via `TITLE`).
- Removed `src/app/api/og/route.tsx` + `articles.ts` (the old site card: "Be one of the first 1,000 to sign — ai-for-people.org") and `src/app/api/og/scorecard/*` (footer "ai-for-people.org/scorecard"). The scorecard pages now fall back to the site card. Their metadata uses `SITE_TITLE` and has no em dashes; the visible scorecard heading is unchanged (`META_TITLE` vs `TITLE`). `/api/og/signer/[id]` (per-signer share card) stays: it contains neither phrase.
- `/signatories/[id]` preview title is now "<name> signed The People's AI Bill of Rights".
- Tests: removed `og-homepage` and `og-articles-drift` (they tested the deleted route). Updated `site-metadata`, `root-metadata`, `route-metadata` and `scorecard.page` for the new title, image, separator and em-dash rule. 1,128 tests pass; `tsc` and ESLint are clean.

### Potential concerns to address:
- The scorecard pages lose their per-company generated cards and now share the site card. If per-company cards are wanted back, restore those routes with the new domain text instead.
- Visible body copy still has em dashes. This PR only touches link-preview metadata.
- `metadataBase` still comes from `NEXT_PUBLIC_SITE_URL` / `PRODUCTION_ORIGIN` (ai-for-people.org). The image URL resolves there; theaibill.org redirects to it.

---
