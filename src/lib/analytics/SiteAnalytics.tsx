"use client";

/**
 * The one thing the root layout has to mount for any of this to exist.
 *
 * `track()` from @vercel/analytics is a NO-OP unless the vendor script was
 * injected, so without `<Analytics />` on the page every funnel event in
 * src/lib/analytics is written, called, and silently discarded. This component
 * is the client boundary that fixes that — kept separate from the layout so
 * the layout itself stays a server component (see the App Router analytics
 * guide: "the most performant approach is to create a separate component that
 * the root layout imports").
 *
 * It also fires the top of the funnel. `share_link_landed` has to be measured
 * where the URL still has its params on it: by the time someone signs, the
 * `?ref=`/`?via=` are long gone from the address bar and only the cookie
 * remembers them.
 */

import { useEffect } from "react";
import { Analytics } from "@vercel/analytics/next";
import { shouldReportLanding } from "./landing";
import { trackShareLinkLanded } from "./track";

/**
 * Read the params off `window.location` rather than `useSearchParams()`.
 * The hook forces every page that renders this component into client-side
 * rendering (it opts the whole subtree out of static generation unless it is
 * wrapped in its own Suspense boundary) — a steep price for an analytics
 * beacon. `location.search` in an effect costs nothing and sees exactly the
 * same query string.
 */
function ShareLandingBeacon(): null {
  useEffect(() => {
    if (typeof window === "undefined") return;
    // Whether this arrival counts, and with what facets, is decided by
    // `shouldReportLanding` — pure, and unit-tested in tests/lib.
    const landing = shouldReportLanding(
      window.location.search,
      window.location.pathname,
    );
    if (!landing) return;
    trackShareLinkLanded(landing);
  }, []);

  return null;
}

export function SiteAnalytics(): React.ReactElement {
  return (
    <>
      <Analytics />
      <ShareLandingBeacon />
    </>
  );
}
