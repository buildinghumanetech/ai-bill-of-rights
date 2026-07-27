/**
 * The gate on `share_link_landed`.
 *
 * This is the top of the funnel and the only place the `?ref=`/`?via=` params
 * are still visible — by the time someone signs they are long gone from the
 * address bar. Two things have to hold: an arrival with no attribution must
 * produce NO event (otherwise ordinary pageviews bury the signal), and an
 * arrival with attribution must carry the right facets.
 */

import { describe, expect, it } from "vitest";
import { shouldReportLanding } from "@/lib/analytics/landing";

const ID = "eeeb0d40-7bee-4bc9-8808-fecb955a8db0";

describe("shouldReportLanding", () => {
  it("reports a fully attributed arrival", () => {
    expect(shouldReportLanding(`?ref=${ID}&via=linkedin`, "/")).toEqual({
      channel: "linkedin",
      referred: true,
      path: "/",
    });
  });

  it("reports a ref-only arrival with a null channel", () => {
    expect(shouldReportLanding(`?ref=${ID}`, "/signatories")).toEqual({
      channel: null,
      referred: true,
      path: "/signatories",
    });
  });

  it("reports a channel-only arrival as unreferred", () => {
    // A QR code or a link someone re-shared without the ref still tells us
    // which surface it came from.
    expect(shouldReportLanding("?via=qr", "/")).toEqual({
      channel: "qr",
      referred: false,
      path: "/",
    });
  });

  it("stays silent on an arrival that carried no attribution", () => {
    expect(shouldReportLanding("", "/")).toBeNull();
    expect(shouldReportLanding("?utm_source=newsletter", "/")).toBeNull();
  });

  it("stays silent when the params are present but junk", () => {
    // A non-UUID ref and an unknown channel are not attribution; firing here
    // would put garbage in the only bucket that measures the loop.
    expect(shouldReportLanding("?ref=haxx&via=carrier-pigeon", "/")).toBeNull();
  });

  it("still reports when one of the two params is junk", () => {
    expect(shouldReportLanding(`?ref=${ID}&via=carrier-pigeon`, "/")).toEqual({
      channel: null,
      referred: true,
      path: "/",
    });
    expect(shouldReportLanding("?ref=haxx&via=x", "/")).toEqual({
      channel: "x",
      referred: false,
      path: "/",
    });
  });

  it("accepts URLSearchParams as well as a raw search string", () => {
    expect(
      shouldReportLanding(new URLSearchParams(`ref=${ID}&via=x`), "/"),
    ).toEqual({ channel: "x", referred: true, path: "/" });
  });

  it("omits path entirely when the caller has none", () => {
    const landing = shouldReportLanding(`?ref=${ID}`);
    expect(landing).not.toBeNull();
    expect(landing).not.toHaveProperty("path");
  });
});
