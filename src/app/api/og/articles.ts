/**
 * Short forms of the nine articles, used by the homepage OG card.
 *
 * These live here rather than in `route.tsx` because an App Router route file
 * may only export handlers and a fixed set of config keys — Next's generated
 * route types reject any other export, which fails `next build` (and does NOT
 * show up in a bare `tsc --noEmit`, since `.next/types` isn't generated yet).
 *
 * The strings are hand-written paraphrases, NOT derived from the markdown: the
 * real headings are far too long for a 3x3 grid on a 1200x630 card ("You Have
 * the Right to Know You're Talking to a Machine" is one cell). That makes them
 * a drift risk — the Bill of Rights is a living, versioned document, so an edit
 * to `content/bill-of-rights/` would leave the share card silently
 * misrepresenting it in every social feed.
 *
 * `tests/app/og-articles-drift.test.ts` is the tripwire: it parses the current
 * version's headings and fails if the count, the numbering, or the ordering no
 * longer lines up with this list. When it goes red, rewrite these strings.
 */
export const ARTICLES = [
  "Your data belongs to you",
  "Your memory is portable",
  "Know when it's a machine",
  "No manipulation against you",
  "A right to an explanation",
  "A right to human contact",
  "Children are not a market",
  "Builders are accountable",
  "Your attention is yours",
] as const;
