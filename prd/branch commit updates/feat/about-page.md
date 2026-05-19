# Branch Progress: feat/about-page

## Progress Update as of [2026-05-19 14:45 Pacific]
*(Most recent updates at top)*

### Summary of changes since last update
First commit on the branch. Adds a "Who created this?" link on the
homepage just below the "Join [N] other real people…" subtitle, and
ships a real `/about` page with an embedded Building Humane Technology
YouTube video above the fold and a founder-highlight section for
Erika Anderson. Branched off the latest `origin/main` (commit
8c4a9e7, the PR #12 hotfix merge) so the work is independent of any
in-flight branches.

### Detail of changes made:
- **`src/app/page.tsx`**: split the prior single-paragraph subtitle
  block into two paragraphs. The first one (unchanged) is the
  "Join [N] other real people who have signed this AI Bill of
  Rights" call-out. Directly under it, a centered, regular-sized
  paragraph holds the new "Who created this?" link to `/about`,
  with the prior `mb-10`/`sm:mb-14` bottom margin moved from the
  Join paragraph to this new one so the spacing into Article 01
  stays the same.
- **`src/app/about/page.tsx`** rewritten from the prior Phase 1
  stub:
  - Top: "← AI Bill of Rights" back-link, the `h1` "Who created
    this?", a one-liner crediting the Building Humane Technology
    community (with an outbound link to buildinghumanetech.com).
  - Above-the-fold: a 16:9 responsive YouTube iframe embedding
    `https://www.youtube.com/embed/LgOE-uRs2IM` (the YouTube ID
    from the URL the user supplied). Wrapped in a rounded
    `bg-zinc-900` card with `aspect-video` so it fills the column
    width and scales with viewport.
  - Mid: "The driving force" section describing Building Humane
    Technology as the community behind the document.
  - Founder card: emerald-tinted-ish bg-zinc-50 card with the
    "Founder" overline, Erika Anderson as `h2`, a bio paragraph
    linking her to HumaneBench and the Bill of Rights document
    work, and two outbound links (buildinghumanetech.com,
    humanebench.ai).
  - "How to contribute" bullet list: Sign it / Share it / Edit it.
    The Edit-it bullet links to the GitHub repo for the document.
  - Metadata: title and description set via `generateMetadata`-
    style top-level `export const metadata` for social previews.
- **Branch**: `feat/about-page` created with `git worktree add -b`
  off `origin/main`. Tracking `origin/main`. Will be pushed to
  origin and PR'd separately from `feat/homepage-redesign` (which
  still has unmerged post-merge polish commits — those are out of
  scope here).

### Potential concerns to address:
- **The Phase 1 stub `/about` page** said "Erika Anderson (Building
  Humane Technology / HumaneBench.ai)" already; this commit replaces
  it wholesale. Anything that linked to the prior stub copy still
  works since we kept the route.
- **The `/v/[version]/as-code` route was removed on main** (no
  page.tsx at that path). The first draft of the About page linked
  to `/v/1.0.0/as-code`; that link was replaced with a "Share it"
  bullet to avoid a 404. If the as-code route comes back in a
  future phase, we can restore the link.
- **No transcript / accessibility caption** for the embedded video.
  YouTube provides auto-CC but for production we may want a
  transcript link below the player.
- **YouTube embed leaks referrer + sets cookies** by default. The
  iframe uses `referrerPolicy="strict-origin-when-cross-origin"`
  which limits the referer header but does not prevent the
  YouTube cookies once the user clicks play. For full
  privacy-by-default we'd swap to youtube-nocookie.com.

---
