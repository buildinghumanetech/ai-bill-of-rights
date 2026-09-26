# Branch Progress: feat/og-v3

## Progress Update as of 2026-09-26 13:15 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
First commit. This replaces the closed #98 and the abandoned restyle; the site's look is unchanged. New link preview: `public/og-v3.png` (Erika's `og-photo-wall-v2.png`, byte-identical, 1200x630) is og:image and twitter:image (summary_large_image) wherever the old homepage card was used. The name becomes "The People's AI Bill of Rights" (`SITE_NAME`, so the homepage h1 changes too). `SITE_TITLE` is "The People's AI Bill of Rights: A People's Demand for Human-Centered AI", and the description is "The future is ours to name. Make your voice heard. Sign at theaibill.org". The "I signed" card and both scorecard cards keep their layouts but take the site's style (gray band, blue accents, Geist, no green). The old green homepage OG route is gone. No migrations.

### Detail of changes made:
- `src/lib/site-metadata.ts`: `SITE_NAME`, `SITE_TITLE` (colon, no em dash), `SITE_DESCRIPTION`, `OG_IMAGE_URL = "/og-v3.png"` with alt text. The site card object is used for both OG and Twitter. Subpage titles read "<page> | The People's AI Bill of Rights". New `withoutEmDashes()` runs on every `buildPageMetadata` title and description, because resource titles and subtitles in `content/resources` use em dashes.
- Removed `src/app/api/og/route.tsx` + `articles.ts` (green card: "Be one of the first 1,000 to sign — ai-for-people.org") and their tests `og-homepage`, `og-articles-drift`.
- New `src/app/api/og/style.ts`: `OG_COLORS` (zinc/blue hex from the site palette), `OG_TAG`, and `loadGeist()`, which reads `assets/fonts/Geist-{Regular,SemiBold,Bold}.ttf` (OFL, from Google Fonts) once per instance, following the Next docs' `readFile(join(process.cwd(), …))` pattern. `next.config.ts` adds `outputFileTracingIncludes` for `/api/og/**` so the fonts ship. Satori can't fake bold, which is why the real weight files are needed.
- `src/app/api/og/signer/[id]/route.tsx`: same layout. The band is `#fafafa` with a `1px #e4e4e7` bottom border, an uppercase gray tag "The People's AI Bill of Rights", and "I signed." (`#09090b`) followed by "Signer #N" (`#2563eb`). The initial avatar is `#dbeafe`/`#2563eb`, the "Why I signed" label and quote bar are blue, the text is near-black and gray, and the font is Geist. The amber footer is kept; its text is now "Join them. Sign at theaibill.org" (no em dash).
- `src/app/api/og/scorecard/card.tsx` + both scorecard routes: the same band, tag, Geist and blue badge and stat numbers. The "Meets" pill is site blue (`#dbeafe`/`#1e40af`/`#93c5fd`) instead of emerald, because the rule is no green anywhere. The not-assessed label is "Not assessed" (was "—"), the footer reads "theaibill.org/scorecard: read the sources yourself", and the example strip reads "EXAMPLE ENTRY: NOT A REAL COMPANY". The company card's body padding is 12px (was 24px) and the caption margin is 12px (was 20px), so the caption clears the footer with Geist's metrics.
- The scorecard page's metadata title separator is " | ", and its description has no em dash.
- Tests: new `tests/app/api/og.site-style.test.ts` records what each route hands ImageResponse and checks the band, tag, headline colors, avatar, quote accents, the Geist fonts, and no green, old domain or em dash. It was mutation-checked by putting a green avatar back. Metadata tests were updated for the new name, title, description, image and " | ". 1,133 tests pass; `tsc` is clean; there are no new ESLint findings project-wide against main.

### Potential concerns to address:
- On the per-company scorecard card, "Meets" (blue) sits next to "Unclear" (sky blue). They're readable apart, but closer than green vs sky was. The scorecard page itself still shows "Meets" in green, because the site's look is unchanged.
- The "ai-for-people.org" mentions outside the OG images (team inbox `hello@ai-for-people.org`, `PRODUCTION_ORIGIN`, env fallbacks, the share-link domain list) are deliberately untouched (Erika chose "link previews only").
- `SITE_NAME` also shows in visible copy that reads it (the homepage h1, the scorecard page h1, the signer page titles).

---
