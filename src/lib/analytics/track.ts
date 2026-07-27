/**
 * The one place the site talks to an analytics vendor.
 *
 * Components call the named `track*` helpers below; nothing imports
 * `@vercel/analytics` directly. That buys three things: event names stay
 * consistent, every payload goes through the same sanitiser, and replacing
 * the vendor is a change to `defaultSink` rather than a grep across the app.
 *
 * Everything here is fire-and-forget and safe to call anywhere — on the
 * server, during SSR, or in a test — where it simply does nothing.
 *
 * PRIVACY NOTE: we never send a signer id to the analytics vendor. Events
 * carry `channel` and a boolean `referred`; "which signer drives referrals"
 * is a database question (`countReferralsBySigner`), not an analytics one.
 */

import {
  ANALYTICS_EVENTS,
  type AnalyticsEventName,
  type AnalyticsProps,
} from "./events";
import type { ShareChannel } from "@/lib/share/urls";

export { ANALYTICS_EVENTS };
export type { AnalyticsEventName, AnalyticsProps };

export type AnalyticsSink = (
  name: AnalyticsEventName,
  props?: AnalyticsProps,
) => void;

/**
 * Browser-only: `@vercel/analytics` is imported lazily so this module stays
 * importable from server components and from the node-environment test suite.
 */
const defaultSink: AnalyticsSink = (name, props) => {
  if (typeof window === "undefined") return;
  void import("@vercel/analytics")
    .then(({ track }) => track(name, props))
    .catch((err) => {
      // Analytics is never worth breaking a page over — most commonly this is
      // just an ad blocker refusing to load the script.
      console.warn("[analytics] event dropped:", name, err);
    });
};

let sink: AnalyticsSink = defaultSink;

/**
 * Swap the destination for events. Intended for tests and for the day we
 * change vendors; pass null to restore the default.
 */
export function setAnalyticsSink(next: AnalyticsSink | null): void {
  sink = next ?? defaultSink;
}

/** Strip undefined/empty values so the dashboard isn't full of blank facets. */
function clean(props?: AnalyticsProps): AnalyticsProps | undefined {
  if (!props) return undefined;
  const out: AnalyticsProps = {};
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === "") continue;
    out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Low-level escape hatch. Prefer the named helpers below. */
export function track(name: AnalyticsEventName, props?: AnalyticsProps): void {
  try {
    sink(name, clean(props));
  } catch (err) {
    console.warn("[analytics] sink threw:", name, err);
  }
}

// ─── Funnel helpers ───────────────────────────────────────────────────────────

/**
 * A visitor arrived on a link carrying attribution params.
 *
 * `channel` is absent when the link carried a `?ref=` but no `?via=`, and it
 * is OMITTED rather than filled with a placeholder — exactly as
 * `trackSignatureCompleted` treats it. The two events are the two ends of the
 * same funnel, so they have to bucket "no channel" identically: an arrival
 * filed under `channel=unknown` that converts into a row with no `channel`
 * facet at all cannot be joined to its own conversion.
 */
export function trackShareLinkLanded(opts: {
  channel?: ShareChannel | string | null;
  referred?: boolean;
  path?: string;
}): void {
  track(ANALYTICS_EVENTS.shareLinkLanded, {
    channel: opts.channel ?? undefined,
    referred: opts.referred ?? false,
    path: opts.path,
  });
}

/** The sign modal was opened. `source` is which button they came from. */
export function trackSignModalOpened(opts: { source?: string } = {}): void {
  track(ANALYTICS_EVENTS.signModalOpened, { source: opts.source });
}

/** Name + contact submitted — the step before OTP verification. */
export function trackSignFormSubmitted(
  opts: { method?: "email" | "phone" } = {},
): void {
  track(ANALYTICS_EVENTS.signFormSubmitted, { method: opts.method });
}

/**
 * OTP verified and the signature is recorded. `referred` marks conversions
 * that came in through somebody's share link; `channel` is the `?via=` surface
 * they originally arrived from, read back out of the first-party cookie at
 * signing time. Together they are what turns "which surface converts" from a
 * guess into a number.
 *
 * `channel` is deliberately optional and nullable: a visitor who typed the URL
 * has no channel, and `clean()` strips it rather than filling the dashboard
 * with an "unknown" bucket that means two different things. `trackShareLinkLanded`
 * does the same, so both ends of the funnel agree on what "no channel" looks like.
 */
export function trackSignatureCompleted(
  opts: {
    method?: "email" | "phone";
    referred?: boolean;
    channel?: ShareChannel | string | null;
  } = {},
): void {
  track(ANALYTICS_EVENTS.signatureCompleted, {
    method: opts.method,
    referred: opts.referred ?? false,
    channel: opts.channel ?? undefined,
  });
}

/**
 * A share action was taken. `channel` is the surface (x / linkedin / email /
 * copy / …) and `surface` says where on the site it happened, e.g.
 * "post-sign" vs "signer-page".
 */
export function trackShareClicked(opts: {
  channel: ShareChannel | string;
  surface?: string;
}): void {
  track(ANALYTICS_EVENTS.shareClicked, {
    channel: opts.channel,
    surface: opts.surface,
  });
}
