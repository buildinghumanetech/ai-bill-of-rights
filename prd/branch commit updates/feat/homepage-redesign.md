# Branch Progress: feat/homepage-redesign

## Progress Update as of [2026-05-19 08:45 Pacific]
*(Most recent updates at top)*

### Summary of changes since last update
Populated initial subtitle + sourceUrl + abstract for all 29 resource
markdown files, pulling from public sources (gdpr-info.eu,
bidenwhitehouse.archives.gov, leginfo.legislature.ca.gov,
artificialintelligenceact.eu, humanetech.com, aisi.gov.uk, FTC, IAPP,
EFF, WHO) plus public-domain knowledge for the ones that blocked
automated fetches (humanebench.ai is JS-rendered; ICO and several FTC
pages returned 403).

### Detail of changes made:
- **`content/resources/*.md`** (29 files): each now has a one-line
  subtitle, a canonical `sourceUrl`, and a 2-paragraph abstract.
- **HumaneBench Principle files**: humanebench.ai is fully JS-rendered
  so the raw HTML offered nothing to parse. The Dignity / Honesty /
  Non-Manipulation / Transparency / Empowerment / Respect User
  Attention pages link `sourceUrl: https://humanebench.ai/principles`
  and carry concise descriptions consistent with the principle names
  and the surrounding humane-tech literature. The user should
  verify/replace these against the canonical HumaneBench copy when
  the site is more easily accessible.
- **Government / regulator pages that 403'd**: the FTC's
  "keep-your-ai-claims-in-check" post and the ICO Children's Code
  page are still linked as `sourceUrl` (canonical), but the
  abstracts are written from generally-known public material rather
  than verbatim from the page. Same caveat — user can refine.
- **Fetched cleanly**: GDPR Articles 7, 20, 22 (gdpr-info.eu); EU AI
  Act Article 5 (artificialintelligenceact.eu); 2022 White House AI
  Bill of Rights (bidenwhitehouse.archives.gov, the active archive
  since the OSTP page was removed); California SB 1001 (leginfo.
  legislature.ca.gov); Center for Humane Technology (humanetech.
  com); UK AI Safety Institute (aisi.gov.uk).

### Potential concerns to address:
- **HumaneBench abstracts are necessarily summarized from outside the
  source**. If HumaneBench has specific definitions for each
  principle, those should override mine.
- **Some sourceUrls point to landing pages** rather than the most-
  specific canonical reference (e.g. CHT's homepage rather than a
  specific "attention rights" page). The user can swap in the more-
  specific URL where one exists.
- **No images, sub-headings, or rich markdown formatting** in the
  abstracts yet. The resource page currently renders body as plain
  paragraphs split on blank lines — if we want headings / bold /
  links inside the body, we'd add a proper markdown renderer.

---

## Progress Update as of [2026-05-19 08:30 Pacific]
*(Most recent updates at top)*

### Summary of changes since last update
Wired up "Connects to" pills for all 9 articles using the per-article
lists pasted in from the original Google Doc. Created 26 new resource
markdown stubs (titles only — bodies will be filled in by the user).
Restyled the pills: less-rounded corners and a deterministic pastel
palette so the same slug always renders the same color.

### Detail of changes made:
- **`content/resources/*.md`** — 26 new files (29 total now):
  - Article 2: gdpr-article-20-data-portability, interoperability-
    advocacy, competitive-ai-market-concerns
  - Article 3: humanebench-principle-honesty, california-bot-
    disclosure-act-sb-1001, ftc-guidance-deceptive-ai
  - Article 4: humanebench-principle-non-manipulation, eu-ai-act-
    prohibited-practices, ftc-act-section-5
  - Article 5: humanebench-principle-transparency, white-house-ai-
    bill-of-rights-2022, gdpr-article-22-automated-decision-making
  - Article 6: humanebench-principle-empowerment, consumer-
    protection-law, healthcare-ai-ethics-literature
  - Article 7: coppa, uk-age-appropriate-design-code, ieee-ai-
    children-working-group, childrens-rights-frameworks
  - Article 8: humanebench-as-measurement-infrastructure, eu-ai-act-
    conformity-assessments, uk-ai-safety-institute, algorithmic-
    audit-proposals
  - Article 9: center-for-humane-technology-attention-rights,
    humanebench-respect-user-attention, eu-ai-act-prohibited-
    practices-subliminal-manipulation
- **`src/app/page.tsx`**:
  - Each of the 9 articles now has a `connects: [{title, slug}]`
    array matching the Google Doc.
  - New `PILL_COLORS` array with 10 pastel combos (border + bg + text
    + hover). Full class strings so Tailwind's JIT emits them
    correctly.
  - New `pillColor(slug)` helper: trivial char-code-sum hash → palette
    index, so each slug deterministically maps to one of the 10
    pastels. Same pill = same color across articles + reloads.
  - Pill links: `rounded-md` (was `rounded-full`) — much less curvy.
    Per-pill `bg`/`border`/`text`/`hover` classes come from
    `pillColor(slug)`.

### Potential concerns to address:
- **Markdown stubs are empty.** Every resource page renders a
  placeholder pointing at `content/resources/<slug>.md` for the
  abstract — the user is expected to fill those in.
- **Color collisions are possible.** With 29 slugs and 10 colors,
  ~3 slugs share each color on average. No effort is made to
  separate adjacent pills' colors — they may sometimes be the same.
  Acceptable for now; if it gets visually monotonous we can
  per-article shuffle or rotate.
- **"EU AI Act prohibited practices"** vs **"EU AI Act prohibited
  practices (subliminal manipulation)"** are intentionally kept as
  separate resources (different slugs) because Article 4 cites the
  general category and Article 9 cites the specific subset. If the
  user wants them merged later, easy to consolidate.

---

## Progress Update as of [2026-05-19 08:15 Pacific]
*(Most recent updates at top)*

### Summary of changes since last update
Added a "Connects to" pill row on each article that links to a new
`/resources/[slug]` route. Each pill is a clickable page driven by a
blog-style markdown file in `content/resources/`. Article 1's three
pills from the original Google Doc are wired up — HumaneBench
Principle (Dignity), GDPR Article 7, and emerging state-level AI
legislation. Articles 2-9 have empty connects arrays pending content
from the user.

### Detail of changes made:
- **`content/resources/*.md`** (3 new files): one per Article 1 pill,
  with frontmatter (`title`, `subtitle`, `sourceUrl`) and a body
  section. Currently only `title` is filled in; the user will
  populate the rest.
  - `humanebench-principle-dignity.md`
  - `gdpr-article-7.md`
  - `emerging-state-ai-legislation.md`
- **`src/lib/resources.ts`** (new): minimal frontmatter parser
  (regex-based, no `gray-matter` dependency needed) plus
  `listResourceSlugs()` and `getResource(slug)`. Reads from
  `content/resources/*.md` via `node:fs`.
- **`src/app/resources/[slug]/page.tsx`** (new): the resource page.
  Uses `generateStaticParams()` to pre-render every resource at build
  time. Layout: "← AI Bill of Rights" back-link, then a header card
  with title / optional subtitle / optional Source URL, then the body
  rendered as paragraphs (split on double-newline). When the body is
  empty, shows a placeholder pointing the user to the markdown file
  to edit. `generateMetadata` populates `<title>` and the OG/Twitter
  description.
- **`src/app/page.tsx`**:
  - Extended Article 1's data with a `connects: [{ title, slug }]`
    array of the three pills from the original Google Doc.
  - New conditional render below the article body: an inline row
    starting with "Connects to" label, followed by rounded-full
    pill links to each `/resources/[slug]`. Hover state highlights
    the pill. Articles 2-9 don't render this block because their
    `connects` is undefined.

### Potential concerns to address:
- **Articles 2-9 have no pills yet**. The user is expected to provide
  the pill lists per article (similar to Article 1's three).
- **Markdown body rendering is very minimal** — split on blank lines,
  no headings/lists/inline-formatting beyond paragraphs. If the user
  wants richer markdown (h2 sections, links inside body, lists), we
  can swap in `remark`/`remark-html` later.
- **`generateStaticParams` reads from disk at build time**, so adding
  a new resource markdown file requires a fresh build/deploy to
  surface it via the static path. In dev mode this isn't an issue.

---

## Progress Update as of [2026-05-19 08:00 Pacific]
*(Most recent updates at top)*

### Summary of changes since last update
Reverted the "wall behind articles" overlap pattern. The user found it
visually confusing — they want the wall **contained in the upper image
area** with the full 1→25 zoom happening inside the hero's sticky
range, then articles flowing normally below with no wall behind them.
HeroSection is now a single section that does the entire 1→25 zoom
within a 220vh sticky range; articles + footer are siblings with
solid backgrounds and no overlap.

### Detail of changes made:
- **`src/app/HeroSection.tsx`**: back to the 5×5 grid (25 images) with
  `START_SCALE = 5`. At progress=0 only the center BHT whiteboard cell
  is visible; at progress=1 the full 5×5 wall is visible. Section
  height: 220vh (matching the original 3×3 hero's scroll budget —
  more zoom packed into the same scroll length, so the change-per-
  scroll-unit is more dramatic).
- **`src/app/page.tsx`**: removed the `<WallBehindArticles>` wrapper.
  The article section is back to solid `bg-white` and the footer
  section to solid `bg-zinc-50` — no translucency, no backdrop-blur,
  no overlap with the hero. Articles flow normally below the hero
  once it unpins.
- **`src/app/WallBehindArticles.tsx`**: deleted. Orphan file removed.

### Potential concerns to address:
- **Animation density at 220vh**: with the full 1→25 zoom in a 120vh
  sticky range, each scroll-unit advances the zoom faster than the
  original 1→9 did. If it feels too fast, bump section height up
  (e.g., 280vh) to slow the animation. If it feels too slow, tighten
  it (e.g., 180vh).

---

## Progress Update as of [2026-05-19 07:45 Pacific]
*(Most recent updates at top)*

### Summary of changes since last update
Fix to WallBehindArticles so the zoom is actually perceptible. The
`-mt-[100vh]` Tailwind class apparently wasn't being emitted (the
arbitrary-value JIT path is finicky with negative viewport units), so
the article overlay was rendering below the wall rather than on top of
it — the wall stayed pinned at viewport top with no overlay to scroll
over it, and the zoom appeared to be "stuck". Switched to an inline
`style={{ marginTop: "-100vh" }}` so the overlay reliably lands on
top of the wall. Also compressed the zoom animation from "spread over
the full section's scroll range" to a fixed ~150vh of scroll so the
9→25 transition lands within the first couple articles' worth of
scroll instead of dragging across the whole column.

### Detail of changes made:
- **`src/app/WallBehindArticles.tsx`**:
  - Children container: `-mt-[100vh]` Tailwind class → inline
    `style={{ marginTop: "-100vh" }}`. Verified via curl that the
    rendered HTML now contains `margin-top:-100vh`.
  - Progress calculation: previously `stickyRange =
    sectionRef.offsetHeight - vh`, which gives a sticky range equal
    to (articles_height − 100vh). For a tall articles column that
    range is multiple viewports, so each scroll-unit moved the
    progress only fractionally. Now uses a fixed `ANIM_RANGE_VH =
    150` (so progress reaches 1 after ~150vh of scrolling into the
    section). After progress hits 1, the wall stays at the full
    25-box state while the user finishes reading the remaining
    articles.

### Potential concerns to address:
- **Wall sits at scale=1 for the back half of the article column** —
  if the user wants the zoom-out to continue across the full
  article column instead of finishing in the first ~150vh, bump
  `ANIM_RANGE_VH` up (e.g., 300) or remove the clamp entirely.
- **`-mt-[100vh]` shouldn't actually fail** in a well-configured
  Tailwind 4 install. The inline-style workaround sidesteps it but
  if we ever audit the Tailwind config and prefer a class, that's
  a minor cleanup.

---

## Progress Update as of [2026-05-19 07:30 Pacific]
*(Most recent updates at top)*

### Summary of changes since last update
Big architectural revision so the user reaches the article copy fast
AND the 9-box keeps zooming out as they read: split the hero into two
phases. HeroSection is now back to a quick 3×3 (1 image → 9-box,
short 200vh section). After that, a new sticky `WallBehindArticles`
holds the 5×5 grid behind the entire article + footer area and
animates it from 9-box visible to full 25-box visible as the user
scrolls through the articles. Plus: admin "Add signer" form now
collects first/last name + display-format radio + contact value;
pull-quote styling is bold (no italic).

### Detail of changes made:
- **`src/app/HeroSection.tsx`** reduced back to the 3×3 (9-image)
  hero. 9 BHT images, IMG_9691 at center (index 4). Section height
  200vh (was 260vh in the 5×5 build, even shorter than the original
  220vh). `START_SCALE = 3` so at progress=0 the center cell fills
  the viewport; at progress=1 the full 3×3 is visible. The 3×3 image
  arrangement is identical to the inner 3×3 of the WallBehindArticles
  5×5 so the visual transition between hero and wall is continuous.
- **`src/app/WallBehindArticles.tsx`** (new client component):
  Wraps its children (articles + footer) in a parent `<section>`
  that hosts a sticky 5×5 grid at the back (`z-0`). The grid has
  `transformOrigin: "50% 50%"` and `scale: 5/3 → 1` mapped from
  scroll progress through the section. Children are pulled up
  `-mt-[100vh]` to overlay the sticky wall starting from the section
  top. Each child section uses `bg-white/90 backdrop-blur-md` (or
  `bg-zinc-50/90 backdrop-blur-md` for the footer) so the wall
  shows through faintly behind the text — not enough to harm
  readability, enough to feel that the wall is the canvas behind
  the manifesto.
- **`src/app/page.tsx`**:
  - Imports `WallBehindArticles`.
  - Articles `<section>` and footer CTA `<section>` are both children
    of the new `<WallBehindArticles>`. Articles container gets
    `bg-white/90 backdrop-blur-md`; footer container gets
    `bg-zinc-50/90 backdrop-blur-md`.
  - Pull-quote `<blockquote>` style: dropped the `italic` class,
    upgraded `font-medium` → `font-bold` per user request.
- **`src/server/actions/admin.ts`**: `AdminAddSignerInput` extended
  with optional `contactValue: string`. The server action writes the
  contact value into `consent_records.captured_fields` as
  `contact_value` (with `contact_method: "email" | "sms"` next to
  it). This keeps it private to the consent record (not surfaced on
  /signers, /signatories) but auditable by anyone with DB access —
  exactly what the user wants for outreach lists later.
- **`src/app/admin/signers/AdminAddSignerForm.tsx`** rewritten:
  - First name + Last name fields replace the single Display name.
  - New "Show their name as" radio (initials / first-initial / full)
    that only renders once both names are filled (matches the public
    SignModal UX). Selecting an option determines which formatted
    string is stored as `signers.display_name`.
  - Verified-by radio (Email / Phone). On change, the contact value
    input resets and re-labels accordingly.
  - New contact-value input (email/tel) sits right under the
    verification radio with a note about being stored privately for
    outreach.
  - Affiliation + Location moved below.
  - Submit composes the display name via `formatNamePreview` (same
    logic as the public modal's `formatNamePreview`) and posts the
    full payload including `contactValue`.

### Potential concerns to address:
- **`-mt-[100vh]` overlay**: works in practice because the sticky
  wall takes 100vh of flow and the children come after; pulling
  children up by 100vh lands them at the section top. If the user
  ever switches to a non-sticky layout this offset stops making
  sense — leave a comment in WallBehindArticles to explain.
- **Articles' translucent background means low-bandwidth users
  briefly see the wall before article text repaints**; not a
  correctness issue but worth keeping in mind for perceived perf.
- **Contact values in `consent_records.captured_fields`**: free-text
  jsonb so admins can store malformed input. No validation past
  trim. If we later want to do mass outreach, we should add a
  proper sanitization pass or split contact_value into a typed
  column.

---

## Progress Update as of [2026-05-19 07:00 Pacific]
*(Most recent updates at top)*

### Summary of changes since last update
Big batch: expanded the hero grid from 3×3 to 5×5 (25 images — 9 BHT
images at the inner center plus 16 large-images on the outer ring,
converted from a new `large-images/` folder via sharp), tightened the
hero scroll budget so the user reaches the article copy sooner, added
a manual "Add signer" admin form on `/admin/signers` that bypasses
Clerk OTP, and adjusted three pieces of article copy.

### Detail of changes made:
- **`large-images/` → `public/images/wall/*.webp`**: 21 PNGs (12-27MB
  each, total ~400MB) converted to 1200px-wide WebPs at quality 80
  via a one-off `node -e` script using the project's transitive sharp
  install. Output ~100KB each, ~2.2MB total.
- **`src/app/HeroSection.tsx`**: rewritten to render a 5×5 grid of
  25 images with continuous center-anchored zoom. Row-major order is
  carefully laid out so the inner 3×3 (positions 6-8, 11-13, 16-18)
  is the 9 BHT images that drove the original 9-box reveal, with
  IMG_9691 (the whiteboard "Principle 1, Principle 2" photo) at the
  absolute center (index 12). Sixteen large-images fill the outer
  ring. `START_SCALE = 5` so at progress=0 only the center cell fills
  the viewport; at progress=1 the full 5×5 is visible. Section
  height shortened to `h-[260vh]` (vs. the prior 220vh) so there's a
  bit more scroll runway for the bigger animation but the user still
  reaches Article 01 within ~2 viewports of scroll.
- **`src/app/page.tsx`** copy:
  - Article 01 pull-quote: "The default is no." →
    `The default is "No LLM training on my data"`.
  - Article 02 pull-quote: "Memory built on your life is yours." →
    `LLM memory built on your life is yours.`
  - Pull-quote `<blockquote>` font dropped two sizes
    (`text-xl sm:text-2xl` → `text-sm sm:text-base`) per the user's
    "~50% smaller" guidance.
- **`src/server/actions/admin.ts`**: new `adminAddSignerAction`
  server action. Admin-only (`requireAdminOrBootstrap`). Creates a
  signers row with a synthetic `clerk_user_id` of
  `admin-added-<uuid>` (so the NOT NULL UNIQUE column is satisfied),
  inserts a minimal consent_records row with `captured_fields =
  { source: "admin_added", admin_signer_id, added_at_utc }`, and a
  signatures row for the requested version. revalidates /, /signers,
  /admin/signers.
- **`src/app/admin/signers/AdminAddSignerForm.tsx`** (new): client
  component that collapses to a "+ Add signer manually" button by
  default. Expanding shows a card with fields: Display name
  (required), Affiliation, Location, Verified-by radio
  (Email | Phone), Notification preference radio (Major | Minor |
  None), Grant-admin checkbox. Submit calls
  `adminAddSignerAction` in a `useTransition`, surfaces inline
  errors, and resets + collapses on success.
- **`src/app/admin/signers/page.tsx`**: imports the new form and
  renders it above the signers table.

### Potential concerns to address:
- **Manually-added signers have a `clerk_user_id` like
  `admin-added-<uuid>`.** This means they can't sign in to Clerk
  themselves to manage their record (the modal's
  `getMySignatureStatus` keys on the current Clerk session's userId
  and won't find their row). For now that's fine — they were added
  on behalf of someone. If we ever need them to claim their record,
  we'd add a "claim" flow that links a real Clerk identity to the
  synthetic row.
- **No upper bound on admin-added cascade.** Deleting an admin-added
  signer works via the same `deleteSignerAction` (cascades
  signatures + consent_records). Nothing special required.
- **Hero scroll behavior**: extending to 25 images (5×5) without
  also extending the scroll length means the zoom is faster per
  scroll-unit than the original 3×3 version. If users want a
  longer dwell on the 9-box state in the middle, we can either
  bump section height back up or apply a non-linear ease curve.

---

## Progress Update as of [2026-05-19 06:45 Pacific]
*(Most recent updates at top)*

### Summary of changes since last update
On `/signatories/[id]`: replaced "{name} signed — you can too." with
"Join {name} as a signer." on its own line, and center-aligned the
"Your data, your choice. Revoke your signature any time." footer line.

### Detail of changes made:
- **`src/app/signatories/[id]/page.tsx`** CTA card sub-paragraph:
  the second sentence now reads "Join {displayName} as a signer." on
  its own line (via `<br />`), invitational rather than peer-pressure
  phrasing.
- **`src/app/signatories/[id]/page.tsx`** footer paragraph: added
  `text-center` so "Your data, your choice. Revoke your signature any
  time." sits centered like the CTA card above it (was left-aligned).

### Potential concerns to address:
- None.

---

## Progress Update as of [2026-05-19 06:30 Pacific]
*(Most recent updates at top)*

### Summary of changes since last update
On `/signatories/[id]`, linked both occurrences of "AI Bill of Rights"
(top subtitle and CTA card heading) to the home page, and removed the
secondary "Or read the full document first" link below the Sign CTA
since the heading itself now provides that affordance.

### Detail of changes made:
- **`src/app/signatories/[id]/page.tsx`**:
  - Top subtitle: "A signer of the **AI Bill of Rights**" — the
    bolded phrase is now a Link to `/` with subtle underline-on-hover.
  - CTA card heading: "Add your name to the **AI Bill of Rights**" —
    same treatment, underlined inline link.
  - Removed the `<p>Or <Link href="/">read the full document
    first</Link>.</p>` footnote inside the CTA section. The heading
    link replaces it.

### Potential concerns to address:
- None.

---

## Progress Update as of [2026-05-19 06:15 Pacific]
*(Most recent updates at top)*

### Summary of changes since last update
Post-sign copy: closed out the call-to-action sentence with a direct
question rather than an exhortation.

### Detail of changes made:
- **`src/app/SignModal.tsx`**: line 2 of the post-sign `<p>` now ends
  "…every time another person signs. Who can you share this with?"
  instead of "…every time another person signs — help us spread it."

### Potential concerns to address:
- None.

---

## Progress Update as of [2026-05-19 06:00 Pacific]
*(Most recent updates at top)*

### Summary of changes since last update
One-line copy tweak on the post-sign share card: replaced "Your
shareable link" with "Share your signature with others".

### Detail of changes made:
- **`src/app/SignModal.tsx`**: the share-card `<label>` text above
  the read-only URL input now reads "Share your signature with
  others" instead of "Your shareable link".

### Potential concerns to address:
- None.

---

## Progress Update as of [2026-05-19 05:45 Pacific]
*(Most recent updates at top)*

### Summary of changes since last update
One-line copy tweak on the post-sign "Thank you" state: replaced "The
fight gets easier" with "AI companies pay more attention" and broke
the success message onto two lines so the v1.0.0 confirmation sits
above the call-to-action sentence.

### Detail of changes made:
- **`src/app/SignModal.tsx`**: the success-state `<p>` now reads
  "Your name is now on v1.0.0." on line 1 and "AI companies pay more
  attention every time another person signs — help us spread it." on
  line 2 (split via a `<br />`).

### Potential concerns to address:
- None — pure copy change, no logic touched.

---

## Progress Update as of [2026-05-19 05:30 Pacific]
*(Most recent updates at top)*

### Summary of changes since last update
A run of modal polish: replaced the native `window.confirm` for
signature removal with an inline confirmation panel (the destructive
prompt now stays inside our modal), slimmed the country dropdown to
flag + dial code only with a custom-positioned caret SVG (the native
caret was crowding the right edge), squared up the Phone SMS / Email
segmented control corners, and dropped the parenthetical hints from
the "Show my name as" radio labels so the previews stand alone.

### Detail of changes made:
- **`src/app/SignModal.tsx`** — inline remove-confirm:
  - New `confirmingRemove` boolean state. Clicking "Remove my
    signature" no longer calls `window.confirm`; it sets
    `confirmingRemove = true` and the action area swaps to a red
    panel with the explicit warning ("Remove your signature from the
    AI Bill of Rights? This deletes your signer record and is
    irreversible.") and two side-by-side buttons: a solid-red "Yes,
    remove" that runs `handleRemoveSignature`, and a white "Cancel"
    that resets the confirm state. Both disable while the deletion
    is in-flight.
  - `confirmingRemove` is also reset alongside the other modal
    state in the close `useEffect` so a fresh open always starts
    out of the confirmation state.
- **`src/app/SignModal.tsx`** — country dropdown slimmed with custom
  caret:
  - `<option>` text is now just `{flag} {code}` (e.g. "🇺🇸 +1"); the
    country name moved to the `title` attribute on the select so it
    still surfaces as a tooltip / a11y hint when the user hovers.
  - Width pinned to `w-[5.75rem]` (92px).
  - Native browser caret hidden with `appearance-none`; replaced with
    a 12×12 SVG chevron positioned `absolute right-2 top-1/2
    -translate-y-1/2`. Wrapper `<label>` gets `relative` to anchor
    the caret. Right padding bumped to `pr-7` to leave room for the
    chevron without overlapping option text.
- **`src/app/SignModal.tsx`** — segmented control corners:
  - Container `rounded-full` → `rounded-lg`. Inner pill and the
    Phone / Email buttons `rounded-full` → `rounded-md`. Same slider
    physics; just less circular.
- **`src/app/SignModal.tsx`** — name-format radios:
  - Removed the "(just initials show)" / "(first name plus initial)"
    / "(full name)" hint spans next to each option label. The
    masked-name preview itself (mono-spaced font) is now the only
    visible element per option — clearer once a name is entered.

### Potential concerns to address:
- **Mobile select rendering** — native `<select>` with `appearance-
  none` strips iOS Safari's native caret; the SVG chevron replaces it
  consistently. Browser-native open-list UI still differs across
  platforms but that's expected.
- **`title="United States"` for screen readers** — sets an
  accessible label but doesn't replace per-option text, so blind
  users still hear "🇺🇸 +1" not "United States +1" when picking
  through options. If we ever want true a11y labels per option,
  we'd need a custom dropdown.

---

## Progress Update as of [2026-05-19 05:00 Pacific]
*(Most recent updates at top)*

### Summary of changes since last update
Major modal upgrade: "already signed" view that lets returning signers
remove their signature instead of being asked to sign again,
country-code dropdown (50 countries, US-default) for phone, Phone SMS
flipped to be the left/default segmented option, the Article-01
subtitle widened so it doesn't wrap, and notification-options labels
cleaned up.

### Detail of changes made:
- **`src/server/actions/me.ts`** (new):
  - `getMySignatureStatus(versionString = "1.0.0")` returns a tagged
    union of `{state: "anonymous" | "no-signer" | "not-signed"} |
    SignedStatus` where SignedStatus carries displayName,
    verificationMethod, signedAt (ISO string for clean server→client
    transit), and version. Signed-in users see "already signed"
    only if a row exists for the *current* version — older versions
    don't count.
  - `removeMySignature()` hard-deletes the user's signatures →
    consent_records → signer row (cascade manually because neon-http
    has no transactions). After this the modal flips to the regular
    form so the same Clerk session can re-sign with new preferences
    if desired.
- **`src/app/SignModal.tsx`** — already-signed view:
  - New `signatureStatus` state (plus a `loading` intermediate). On
    `open && isSignedIn`, fires `getMySignatureStatus()` once and
    renders three branches in the form step: loading spinner,
    "already signed" card, or the regular form.
  - Already-signed card: emerald-tinted, shows `displayName`,
    "Verified by Phone / Email — M/D/YY (v1.0.0)" line, then a red
    `Remove my signature` button (window.confirm guard) and a
    secondary `Sign out` button. After removal the status flips to
    `not-signed` and the form re-renders, ready to sign again.
- **`src/app/SignModal.tsx`** — country dropdown + Phone SMS default:
  - New `COUNTRIES` constant inline with 50 entries — US first
    (default), then sensible alpha-by-region grouping. Each row:
    `{ id, code, flag, name }`. Multiple +1 countries are
    distinguishable by `id` (US/CA).
  - Replaced single `identifier` state with three: `email`,
    `phoneDigits`, `countryId`. `selectedCountry` and `identifier`
    are derived from these on each render so the rest of the flow
    (signUp.create, signIn.create, server action) keeps working
    unchanged. `friendlyIdentifier` is also derived for the OTP
    step display so the user sees their input in the format they
    entered it ("🇺🇸 +1 555 123 4567") instead of just E.164
    (`+15551234567`).
  - Form layout in phone mode now uses a native `<select>` for
    country + a `<input type="tel">` for digits. Email mode is a
    single `<input type="email">` with placeholder `me@email.com`.
  - Default `method` flipped to `"phone"`. Segmented pill order
    swapped so Phone SMS is the left/default option and Email
    slides right. Pill transform direction matched
    (`email → translateX(100%)`).
  - Validation: phone path requires ≥7 digits (E.164 minimum-ish);
    email path requires non-empty trimmed value.
- **`src/app/SignModal.tsx`** — notification copy:
  - "Major revisions" hint dropped the "(default)" trailing text
    (still defaults via `useState("major")`).
  - "None" option no longer renders a hint span (was empty string).
- **`src/app/page.tsx`** — subtitle width:
  - `max-w-3xl` → `max-w-5xl` on the "Join [N] other real people…"
    subtitle so it stays on one line at most desktop widths. Still
    wraps on small screens because of viewport constraint, which is
    fine.

### Potential concerns to address:
- **Removing a signature also deletes the Clerk user's signer
  metadata** but leaves their Clerk identity intact. They can sign
  again on the same session. If we ever want full account deletion
  too, that needs a separate Clerk admin API call.
- **The country list is hand-curated** (50 entries). If we need
  full ISO 3166 coverage, swap in a library like
  `country-telephone-data` later. For an English-language
  manifesto launch, 50 covers the practical set.
- **`getMySignatureStatus` runs on every modal open** — a single
  query, cheap, but if modal-open frequency spikes we should debounce
  or cache for the session lifetime.
- **`removeMySignature` doesn't revalidatePath** — the page caller
  reloads via state change, but if the user navigates to /signers
  the count won't refresh until next dynamic fetch. Acceptable
  since /signers is force-dynamic, but worth noting.

---

## Progress Update as of [2026-05-19 04:45 Pacific]
*(Most recent updates at top)*

### Summary of changes since last update
Modal polish round: fixed the off-position segmented "Email / Phone SMS"
slider, bolded the three section labels, hid "Show my name as" until
both name fields are filled, renamed "Proposed revisions" → "None" in
the notification options, added an IP-geolocation fallback so the
"Share my approximate city & state" checkbox actually captures a value
in local dev where Vercel's geo headers aren't present, and finished
the prior round (subtitle CTA + WebP conversion).

### Detail of changes made:
- **`src/app/SignModal.tsx`** segmented control fix:
  - Pill was anchored at the container edge (no `left` set, defaulted
    to `0`) so it visibly sat 4px to the left of where the Email button
    started. Now anchored with `left-1` (4px = the container's `p-1`).
  - Phone-state transform was `translateX(calc(100% + 0.25rem))` which
    over-shot the right slot by 4px. Now `translateX(100%)` (pure
    100% of the pill's own width).
  - The two buttons had natural widths driven by their content
    ("Phone SMS" is wider than "Email"), so the 50/50 pill math
    couldn't align cleanly. Added `min-w-[6rem]` + `text-center` to
    each button so they share the same width.
  - Pill now has `pointer-events-none` so it never intercepts clicks.
- **`src/app/SignModal.tsx`** label + flow polish:
  - "Verify me via", "Show my name as", and "Alert me when the AI
    Bill of Rights is updated" labels all bumped from `font-medium
    text-zinc-700` to `font-bold text-zinc-900`.
  - The "Show my name as" fieldset is now gated behind
    `firstName.trim() && lastName.trim()` — it doesn't render until
    both are filled in, removing the awkward "Jane Doe" placeholder
    preview from first paint. Previews always use the real name now.
  - Notification options reshaped: previous third option "Proposed
    revisions" replaced with "None — Don't notify me". Type and DB
    enum updated to `["major", "minor", "none"]`. No data migration
    needed because the column is plain `text` (the enum lives in
    Drizzle's TypeScript layer only, not as a Postgres CHECK).
- **`src/server/actions/sign-from-modal.ts`** geo fallback:
  - After `extractCapturedFields()`, if `shareLocation` is true and
    both `ip_geo_city` and `ip_geo_country` are empty (i.e. the
    Vercel headers weren't present — typically because we're on
    localhost), hits `https://ipapi.co/json/` server-side with
    `cache: "no-store"` and a custom UA, parses `city`, `region`,
    `country_code`, and fills the fields. Failures are swallowed and
    logged so a flaky third-party doesn't break signing.
  - This means in dev, signing now stamps the developer's real
    city/region/country on their signer row when they opt in.
- **`src/lib/db/schema.ts`**: notification_preference enum updated to
  `["major", "minor", "none"]`. Default still `"major"`.
- **`src/server/actions/profile.ts`**: `NotificationPreference` type
  union updated to `"major" | "minor" | "none"`.
- **`public/images/bht/MIT-Media-Lab-Panel.webp`** (new, 110KB):
  converted from the prior 2.9MB PNG via sharp@0.34.5 at quality 82,
  reached through `node_modules/.pnpm/sharp@0.34.5/.../sharp` since
  sharp is a transitive Next.js dep (not a direct dep we can plain-
  `require`).
- **`public/images/bht/MIT-Media-Lab-Panel.png`**: deleted.
- **`src/app/HeroSection.tsx`**: `IMAGES[7]` updated to the `.webp`
  filename.
- **`src/app/page.tsx`** subtitle:
  - New `<p>` above the `<ol>` in the articles section: "Join [N]
    other real people who have signed this AI Bill of Rights".
    Bold + `text-2xl sm:text-3xl`, centered, with the count fragment
    bold-blue and linked to /signers. Plural-aware: "1 other real
    person who has", or "N other real people who have".
  - Section top padding `pt-24 sm:pt-32` → `pt-10 sm:pt-14`; subtitle
    bottom margin `mb-20 sm:mb-24` → `mb-10 sm:mb-14` so Article 01
    surfaces ~140px earlier on scroll.

### Potential concerns to address:
- **ipapi.co rate limit** is ~30k requests/month free. Production
  shouldn't hit it because Vercel headers populate. But if a
  preview deploy bypasses headers for any reason, we could blow
  through it. Easy to add a cache or switch to ip-api.com if needed.
- **The "none" notification value never triggers an email**, so the
  semantics are clean — but we still don't have a notification job
  wired up at all yet, so this is forward-looking.

---

## Progress Update as of [2026-05-19 04:30 Pacific]
*(Most recent updates at top)*

### Summary of changes since last update
Added a centered, bold call-to-action subtitle above the first article
("Join [N] other real people who have signed this AI Bill of Rights"
with the count linking to /signers), tightened the vertical padding
around it so the document copy starts sooner on scroll, and converted
the heavy MIT panel PNG to WebP (2.9MB → 110KB) to keep the grid asset
light.

### Detail of changes made:
- **`src/app/page.tsx`**: new `<p>` above the `<ol>` in the articles
  section. Bold + `text-2xl sm:text-3xl`, centered, dark-zinc text, with
  the count fragment wrapped in a `<Link href="/signers">` that's bold
  blue. Plural handling: shows "other real person" + "who has" for
  count === 1, otherwise "other real people" + "who have". Section's
  top padding cut from `pt-24 sm:pt-32` to `pt-10 sm:pt-14`, and the
  subtitle's bottom margin from `mb-20 sm:mb-24` to `mb-10 sm:mb-14`,
  so Article 01 shows ~140px earlier on scroll.
- **`public/images/bht/MIT-Media-Lab-Panel.webp`** (new, 110KB):
  converted from the 2.9MB PNG via sharp 0.34.5 at quality 82. Sharp
  isn't a direct dep but Next.js pulls it in transitively; invoked via
  `require('node_modules/.pnpm/sharp@0.34.5/.../sharp')` from a one-shot
  Node script.
- **`public/images/bht/MIT-Media-Lab-Panel.png`**: deleted (replaced by
  the WebP).
- **`src/app/HeroSection.tsx`**: `IMAGES[7]` updated to the `.webp`
  path.

### Potential concerns to address:
- The PNG was added in the previous commit (d45acf7) so its removal
  here costs a touch of repo history bloat; not enough to matter.

---

## Progress Update as of [2026-05-19 04:15 Pacific]
*(Most recent updates at top)*

### Summary of changes since last update
Swapped the bottom-center cell in the 3×3 hero grid from the Singularity
University talk shot to a new MIT Media Lab Panel photo with a slide
("Baseline Results Across 15 Models") visible behind the panelists —
better thematic fit for the AI Bill of Rights site.

### Detail of changes made:
- **`public/images/bht/MIT-Media-Lab-Panel.png`** (new, 2.9MB): added a
  copy of the file the user dropped into the main checkout. Renamed
  from "MIT Media Lab Panel.png" → "MIT-Media-Lab-Panel.png" so the
  path doesn't need URL encoding in the `IMAGES` array.
- **`src/app/HeroSection.tsx`**: `IMAGES[7]` (the bottom-center cell of
  the 3×3 grid; index 4 is the hero center) now points to
  `MIT-Media-Lab-Panel.png` instead of the Singularity University jpg.
  Grid layout, animation math, and other slots are unchanged.

### Potential concerns to address:
- **The PNG is 2.9MB unoptimized.** Next/Image will resize it for the
  cell (sizes="33vw") so the served bytes will be smaller, but the
  source file is now the heaviest asset in `public/`. If repo bloat
  becomes a concern, convert to AVIF/WebP — `cwebp -q 80` will likely
  bring it under 500KB with no visible loss in the small grid cell.

---

## Progress Update as of [2026-05-18 18:45 Pacific]
*(Most recent updates at top)*

### Summary of changes since last update
Modal form polish: inline segmented "Email / Phone SMS" slider, a
name-display-format radio group with live previews, and a
notification-preference radio group. Adds a `notification_preference`
column to `signers` (default `'major'`) with a hand-written migration
file that needs to be applied to Neon before signing works end-to-end
again.

### Detail of changes made:
- **`src/app/SignModal.tsx`** form additions:
  - Verification-method UI is now a segmented control inline with the
    "Verify me via" label, animated white pill behind the active
    option. "Email" or "Phone SMS" inside the active pill, no slider
    track.
  - New `formatNamePreview()` helper (same logic as the server-side
    formatter) computes live previews from current First/Last inputs.
    Falls back to "Jane Doe" sample text until both fields have
    content.
  - "Show my name as" radio group: three options — initials (`J*** D**`),
    first + initial (`Jane D**`), full (`Jane Doe`, default). Each
    label is mono-spaced and shows the actual masked preview based on
    current input.
  - "Alert me when the AI Bill of Rights is updated" radio group: three
    options — Major revisions (default, hint "v2.0.0 → v3.0.0"), Minor
    revisions ("v1.0.0 → v1.1.0"), Proposed revisions ("Pull requests
    against the document").
  - Both new selections are state on the modal and passed through to
    the server action call (`nameDisplayFormat`, `notificationPreference`).
- **`src/server/actions/sign-from-modal.ts`**:
  - `SignFromModalInput` extended with optional `nameDisplayFormat`
    and `notificationPreference`.
  - New private `formatDisplayName(first, last, format)` runs server-side
    to compute the masked name to store as `signers.display_name`. So
    if a signer picks "initials", the public listings/profile pages
    only ever see e.g. `D*** O***`. Their underlying first/last go to
    Clerk's profile as before and are not exposed publicly.
  - The function is **not exported** because the file has
    `"use server"`, which disallows non-async exports.
    `SignModal.tsx` has its own client-side `formatNamePreview()` with
    identical logic for live previews — a small duplication that's
    cheaper than introducing a shared utility module right now.
  - Notification preference is forwarded to `upsertSignerProfile`.
- **`src/server/actions/profile.ts`**:
  - `ProfileInput` extended with `notificationPreference?:
    "major" | "minor" | "proposed"`.
  - Upsert sets the column on both insert and update paths; defaults
    to `'major'` if the caller doesn't pass one (matches the DB
    default).
- **`src/lib/db/schema.ts`**:
  - Added `notificationPreference` column to `signers` with the enum
    `["major", "minor", "proposed"]` and a default of `'major'`.
- **`drizzle/0001_add_signer_notification_preference.sql`** (new): a
  one-line `ALTER TABLE signers ADD COLUMN notification_preference text
  NOT NULL DEFAULT 'major';`. Written by hand rather than via
  `drizzle-kit generate` so the Drizzle journal/snapshot is **not**
  updated — next time someone runs `drizzle-kit generate` it will
  notice the drift and re-emit a similar migration. For now the SQL
  needs to be applied manually (Neon SQL editor) or via
  `pnpm drizzle-kit migrate` before a signature record can be
  inserted, otherwise the insert will fail with a column-doesn't-exist
  error.

### Potential concerns to address:
- **The migration must be applied to the active Neon DB** before
  this version of the modal can record a signature. Until then,
  signing will fail at the `INSERT INTO signers` step. Run:
  ```sql
  ALTER TABLE signers ADD COLUMN notification_preference text NOT NULL
  DEFAULT 'major';
  ```
  in Neon's SQL editor, or `pnpm drizzle-kit migrate` if drizzle-kit
  is set up locally with the right `DATABASE_URL`.
- **Drizzle metadata is now out of sync with the SQL we applied.**
  When the next migration is generated via `drizzle-kit generate`,
  it'll regenerate the same ALTER (because the snapshot doesn't know
  the column was added) — easy to discard but worth being aware of.
  Long-term fix: regenerate `0001_*.sql` + snapshot + journal through
  drizzle-kit and force-replace the hand-written version.
- **No update-notification emails are actually sent yet.** The
  preference is stored but unused. When a new version of the document
  is published, a separate cron/job needs to honor the
  `notification_preference` thresholds and send via Resend.
- **The masked display name is one-way.** A signer who picks
  "initials" and later wants their full name shown has to revoke and
  re-sign (per the existing revocation model). Adding an "edit
  display preferences" action on `/account` would be a small follow-up.

---

## Progress Update as of [2026-05-18 18:30 Pacific]
*(Most recent updates at top)*

### Summary of changes since last update
Replaced the bare "Thank you for signing" state of SignModal with a full
share flow: copy-to-clipboard for the signer's `/signatories/[id]` URL,
X / LinkedIn / Email share buttons, and a multi-email pill input for
sending invitation emails via Resend. Also reworked `/signatories/[id]`
into a real shareable landing page with a prominent Sign CTA so traffic
from social posts converts into more signers.

### Detail of changes made:
- **`src/server/actions/sign-from-modal.ts`**: extended `SignFromModalResult`
  to include `signerId` and `displayName`. The modal needs both — the ID
  to build the share URL, the name to personalize the success copy.
- **`src/lib/email/templates.ts`**: added `signInvitation(opts)` returning
  `{ subject, text }`. Subject: `"{inviterName} invited you to sign the
  AI Bill of Rights"`. Body links to `siteUrl` for reading + signing
  and to `inviterPageUrl` so recipients see who invited them.
- **`src/server/actions/invite.ts`** (new): `sendInvitationsAction(emails)`.
  Requires Clerk auth + an existing signer row (so unsigned visitors
  can't spam invites). Dedupes and lowercases the email list, drops
  malformed entries via a basic regex, caps at 25 emails per request,
  then renders the template once and sends in parallel via Resend.
  Failures per-email are logged + returned in `failed: string[]` so the
  UI can surface partial failures.
- **`src/app/SignModal.tsx`**: the "done" step is now a two-card layout:
  1. **Share link card** with the live `/signatories/[id]` URL,
     copy-to-clipboard (falls back to manual select if Clipboard API is
     blocked), and three pre-filled share buttons (X intent, LinkedIn,
     mailto).
  2. **Invite-by-email card** with a pill input. Enter/comma/semicolon
     adds a pill, backspace on empty input removes the last pill. Each
     pill has its own remove (✕). Submit flushes any unconfirmed input
     into the list, calls `sendInvitationsAction`, and shows either
     "Sent N, M failed." or an inline error.
- **`src/app/signatories/[id]/page.tsx`** rebuilt as a public landing:
  - Adds `generateMetadata` for OG / Twitter card so social previews
    render the signer's name and a one-line pitch.
  - Existing version list and revocation footer kept.
  - Adds a prominent `SignTrigger`-driven CTA card ("Add your name to
    the AI Bill of Rights — Nine commitments we're demanding from
    every AI company. {Name} signed — you can too.") with a blue
    rounded button that opens the same SignModal. Wraps the trigger
    with a "read full document first" fallback link.

### Potential concerns to address:
- **Invitation rate limiting is just a per-request cap (25).** There's
  no per-user-per-hour ceiling, so a determined signer could send
  thousands of invites by re-submitting. Acceptable for launch;
  consider adding a daily counter table later.
- **No tracking of which invites convert.** The invitation email links
  to the homepage with no referral param — we can't tell which signer
  drove which new signature. Easy add: append `?ref=signerId` to the
  invite link and stamp it on the new signer's record.
- **Email validation is basic regex.** Doesn't catch e.g. "+aliases" in
  ways some providers reject, doesn't reject role addresses. Resend
  rejects truly malformed addresses on send, so we're not creating
  spam — just a poor UX for typos.
- **Copy-to-clipboard requires HTTPS or localhost** for the Clipboard
  API. On previous Vercel preview URLs (HTTPS) this is fine; on any
  HTTP origin it falls back to selecting the input text, which is OK
  but easy to miss.

---

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
