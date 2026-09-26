# Branch Progress: feat/og-v3

## Progress Update as of 2026-09-26 14:00 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
The scorecard cards' footer bar and the "EXAMPLE ENTRY" strip are now the same light gray band as the signer card (`#fafafa`, `#71717a` text, `1px #e4e4e7` border), replacing amber. Status pills keep their green, amber, red and sky colors. The scorecard PNGs were re-rendered into `~/Downloads/og-v3-previews/` (company card, plus the index card).

### Detail of changes made:
- `src/app/api/og/scorecard/card.tsx` `FooterCta`: `C.band` background, `1px C.bandBorder` top border, `C.tag` text.
- `src/app/api/og/scorecard/[slug]/route.tsx`: the example strip uses `C.band`, a `1px C.bandBorder` bottom border and `C.tag` text.
- `tests/app/api/og.site-style.test.ts`: amber joins green as status-pill-only (`AMBERS` checked on every non-pill node of every card). The company card asserts the gray strip and footer, and that the "Partial" pill keeps its amber. Mutation-checked: an amber footer fails it.
- 1,134 tests pass; `tsc` is clean.

### Potential concerns to address:
- None new. The only amber and green left on any card are the status pills.

---

## Progress Update as of 2026-09-26 13:30 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Following Erika's review notes, scorecard status pills keep their meaning colors: "Meets" is green again (`#d1fae5` / `#065f46` / `#6ee7b7`, as before and as on the scorecard page). The no-green rule covers brand and accent color only. The signer card's footer ("Join them. Sign at theaibill.org") keeps its text but moves from amber to the light gray band (`#fafafa`, `#71717a` text, `1px #e4e4e7` top border). Preview PNGs are saved to `~/Downloads/og-v3-previews/`.

### Detail of changes made:
- `src/app/api/og/scorecard/card.tsx`: the `STATUS_SWATCH.meets` values are restored, and the header comment says green is a status color only.
- `src/app/api/og/signer/[id]/route.tsx`: the footer uses `C.band` / `C.bandBorder` / `C.tag`. No amber is left on the signer card.
- `tests/app/api/og.site-style.test.ts`:
  - Green is allowed only on status pills. A pill is identified by its swatch's background AND its `2px` swatch border, or by its swatch's color on its own verdict label. Everything else must be green-free.
  - The company card asserts that "Meets" is drawn in its green.
  - A new test checks the signer footer is the gray band with no amber.
  - Mutation-checked both ways: a green badge fails, and a blue "Meets" fails. An earlier, looser pill match (background alone) let a green badge through; that's fixed.
- 1,134 tests pass; `tsc` is clean.

### Potential concerns to address:
- (Resolved 14:00: the scorecard footer and example strip are now gray.)

---

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
- (Resolved 13:30: "Meets" is green again.)
- The "ai-for-people.org" mentions outside the OG images (team inbox `hello@ai-for-people.org`, `PRODUCTION_ORIGIN`, env fallbacks, the share-link domain list) are deliberately untouched (Erika chose "link previews only").
- `SITE_NAME` also shows in visible copy that reads it (the homepage h1, the scorecard page h1, the signer page titles).

---
