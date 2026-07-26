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
import { parseChannel, parseRef } from "@/lib/share/urls";
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
    let params: URLSearchParams;
    try {
      params = new URLSearchParams(window.location.search);
    } catch {
      return;
    }

    const ref = parseRef(params);
    const channel = parseChannel(params);
    // Only an arrival that actually carried attribution is a "share link
    // landed". Firing on every pageview would drown the real signal.
    if (!ref && !channel) return;

    trackShareLinkLanded({
      channel,
      referred: ref !== null,
      path: window.location.pathname,
    });
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
