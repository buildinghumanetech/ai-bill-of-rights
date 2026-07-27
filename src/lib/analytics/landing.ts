/**
 * The decision behind `share_link_landed`, pulled out of the React effect that
 * fires it.
 *
 * It lives in its own module — not inside `SiteAnalytics.tsx` — so it can be
 * unit-tested without a DOM and without dragging `@vercel/analytics/next` into
 * the test's module graph. The component keeps only the parts that genuinely
 * need a browser: reading `window.location` and calling the tracker.
 */

import { parseChannel, parseRef, type ShareChannel } from "@/lib/share/urls";

export interface ShareLanding {
  /** The `?via=` surface, or null when the link carried only a `?ref=`. */
  channel: ShareChannel | null;
  /** Whether the link carried a valid `?ref=`. */
  referred: boolean;
  /** The path landed on, for faceting. Omitted when the caller has none. */
  path?: string;
}

/**
 * Decide whether an arrival is a "share link landed", and with what facets.
 *
 * Returns null for an arrival that carried no attribution at all. That gate is
 * the whole point: firing on every pageview would bury the signal this event
 * exists to produce under ordinary traffic. A `?via=` we don't recognise, or a
 * `?ref=` that isn't a UUID, is not attribution — `parseChannel`/`parseRef`
 * reject them, and an arrival carrying only junk gets no event.
 */
export function shouldReportLanding(
  search: string | URLSearchParams,
  path?: string,
): ShareLanding | null {
  // No try/catch: `new URLSearchParams(string)` does not throw for any string
  // input — junk is simply parsed into junk pairs, which `parseRef`/
  // `parseChannel` then reject. A catch here could never run, and a guard that
  // cannot fire reads as though a real failure mode is being handled.
  const params =
    typeof search === "string" ? new URLSearchParams(search) : search;

  const ref = parseRef(params);
  const channel = parseChannel(params);
  if (!ref && !channel) return null;

  return { channel, referred: ref !== null, ...(path === undefined ? {} : { path }) };
}
