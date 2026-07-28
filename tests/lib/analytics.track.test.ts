/**
 * The funnel helpers themselves. Cheap to pin, and the payload shape is what
 * the dashboard facets on — `channel` in particular, which is the only thing
 * that makes X, LinkedIn and email invites comparable.
 */

import { afterEach, describe, expect, it } from "vitest";
import {
  ANALYTICS_EVENTS,
  setAnalyticsSink,
  track,
  trackShareClicked,
  trackShareLinkLanded,
  trackSignatureCompleted,
  trackSignFormSubmitted,
  trackSignModalOpened,
  type AnalyticsProps,
} from "@/lib/analytics/track";

type Captured = [string, AnalyticsProps | undefined];

function capture(): Captured[] {
  const events: Captured[] = [];
  setAnalyticsSink((name, props) => events.push([name, props]));
  return events;
}

afterEach(() => setAnalyticsSink(null));

describe("funnel helpers", () => {
  it("emits signature_completed with method, referred and channel", () => {
    const events = capture();
    trackSignatureCompleted({
      method: "email",
      referred: true,
      channel: "linkedin",
    });
    expect(events).toEqual([
      [
        ANALYTICS_EVENTS.signatureCompleted,
        { method: "email", referred: true, channel: "linkedin" },
      ],
    ]);
  });

  it("emits signature_completed as unattributed when nothing is known", () => {
    const events = capture();
    trackSignatureCompleted({});
    // `referred: false` is a real fact worth faceting on; a null channel is
    // just noise in the dashboard and gets stripped.
    expect(events).toEqual([
      [ANALYTICS_EVENTS.signatureCompleted, { referred: false }],
    ]);
  });

  it("emits share_clicked with the channel and the surface it happened on", () => {
    const events = capture();
    trackShareClicked({ channel: "x", surface: "post-sign" });
    expect(events).toEqual([
      [ANALYTICS_EVENTS.shareClicked, { channel: "x", surface: "post-sign" }],
    ]);
  });

  it("emits the arrival and mid-funnel steps", () => {
    const events = capture();
    trackShareLinkLanded({ channel: "email", referred: true, path: "/" });
    trackSignModalOpened({ source: "hero" });
    trackSignFormSubmitted({ method: "phone" });
    expect(events.map(([name]) => name)).toEqual([
      ANALYTICS_EVENTS.shareLinkLanded,
      ANALYTICS_EVENTS.signModalOpened,
      ANALYTICS_EVENTS.signFormSubmitted,
    ]);
    expect(events[0][1]).toEqual({
      channel: "email",
      referred: true,
      path: "/",
    });
  });

  it("omits channel on a ref-only landing, exactly as the conversion does", () => {
    // The two ends of the same funnel. A `?ref=`-only arrival has no channel;
    // if this event filed it under an "unknown" bucket while
    // signature_completed stripped it, the landing could never be joined to
    // the conversion it produced — for precisely the links this measurement
    // exists to compare.
    const events = capture();
    trackShareLinkLanded({ referred: true, path: "/" });
    trackSignatureCompleted({ method: "email", referred: true });
    expect(events[0][1]).toEqual({ referred: true, path: "/" });
    expect(events[0][1]).not.toHaveProperty("channel");
    expect(events[1][1]).not.toHaveProperty("channel");
  });

  it("never lets a broken sink escape into the caller", () => {
    // Analytics is fire-and-forget: a throwing vendor must not take a
    // signature down with it.
    setAnalyticsSink(() => {
      throw new Error("vendor exploded");
    });
    expect(() => trackSignatureCompleted({ method: "email" })).not.toThrow();
    expect(() => track(ANALYTICS_EVENTS.shareClicked, { channel: "x" })).not.toThrow();
  });
});
