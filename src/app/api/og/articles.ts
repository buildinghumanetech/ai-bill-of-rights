/**
 * Short forms of the eleven articles, used by the homepage OG card.
 *
 * These live here rather than in `route.tsx` so the drift test can import
 * plain strings without transitively loading `next/og`'s `ImageResponse`
 * runtime and `@/lib/db/queries` just to read them.
 *
 * (A code review claimed a non-handler export from a `route` file fails
 * `next build`, because Next's generated route types require every extra
 * export to be `never`. That was investigated and NOT reproduced: a real
 * `next build` under Next 16.2.6 with the export in place ran TypeScript and
 * succeeded. Don't re-derive that constraint from this file's existence.)
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
  "Bias at scale is discrimination",
  "Tested before it reaches you",
] as const;

/**
 * The card's grid is 3 across by 4 down — twelve cells for eleven articles.
 *
 * The twelfth is deliberately a question rather than blank space or a filler
 * slogan. v0.1.0 took the document from nine to eleven, and the grid that used
 * to be exactly full now has a hole in it; saying so out loud invites the
 * answer instead of pretending the shape was always this.
 *
 * If a twelfth article ever lands, delete this and the cell fills itself.
 */
export const GRID_PLACEHOLDER = "What should go here?";
