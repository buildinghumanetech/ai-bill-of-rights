import { describe, expect, it } from "vitest";
import {
  REF_CHANNEL_COOKIE,
  REF_COOKIE,
  REF_COOKIE_MAX_AGE_SECONDS,
  readChannelCookieValue,
  readRefCookieValue,
  referralCookiesToSet,
} from "@/lib/referral/cookie";

/**
 * The decision layer between "someone arrived with a ?ref=" and "we wrote an
 * attribution cookie". `referralCookiesToSet` is pure, so these tests are the
 * cheapest place to pin the two rules the rest of the referral code assumes:
 * FIRST REF WINS, and nothing unvalidated is ever stored.
 *
 * Scope: the DECISION only — which cookies a given arrival should produce.
 * `src/proxy.ts` delegates that decision here, but it also does work of its
 * own: sequencing this ahead of Clerk's `auth.protect()`, re-wrapping a bare
 * `Response` that has no cookie jar, and deciding whether to touch the
 * response at all. None of that is covered by a green suite here — see
 * tests/app/proxy.referral.test.ts for the wiring.
 */

const REF_A = "11111111-2222-3333-4444-555555555555";
const REF_B = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

function byName(cookies: ReturnType<typeof referralCookiesToSet>) {
  return Object.fromEntries(cookies.map((c) => [c.name, c]));
}

describe("referralCookiesToSet", () => {
  it("records a fresh ref for a visitor who has none", () => {
    const out = byName(
      referralCookiesToSet({
        searchParams: new URLSearchParams(`ref=${REF_A}&via=x`),
        existingRef: null,
        existingChannel: null,
      }),
    );
    expect(out[REF_COOKIE].value).toBe(REF_A);
    expect(out[REF_CHANNEL_COOKIE].value).toBe("x");
  });

  it("keeps the FIRST ref when a second sharer's link arrives later", () => {
    // The whole point of the cookie: whoever actually made the introduction
    // keeps the credit, even if the visitor later clicks someone else's link.
    const out = referralCookiesToSet({
      searchParams: new URLSearchParams(`ref=${REF_B}&via=linkedin`),
      existingRef: REF_A,
      existingChannel: "x",
    });
    expect(out).toEqual([]);
  });

  it("does not let a second link rewrite the channel either", () => {
    // An already-attributed visitor is off-limits entirely: rewriting just the
    // channel would leave the pair describing two different share events.
    const out = referralCookiesToSet({
      searchParams: new URLSearchParams("via=linkedin"),
      existingRef: REF_A,
      existingChannel: "x",
    });
    expect(out).toEqual([]);
  });

  it("drops a malformed ref rather than storing it", () => {
    // If this ever regressed, the junk would ride the cookie all the way to a
    // foreign-key violation at INSERT time.
    const out = referralCookiesToSet({
      searchParams: new URLSearchParams("ref=not-a-uuid&via=x"),
      existingRef: null,
      existingChannel: null,
    });
    // Asserted as an exact set, not a `not.toContain`: the junk ref must be
    // dropped AND the channel must still be recorded. A bare "no ref cookie"
    // check also passes when nothing at all comes back, which would hide a
    // regression that stopped recording the channel on this arrival.
    expect(out.map((c) => c.name)).toEqual([REF_CHANNEL_COOKIE]);
  });

  it("drops an unknown channel rather than storing it", () => {
    const out = byName(
      referralCookiesToSet({
        searchParams: new URLSearchParams(`ref=${REF_A}&via=carrier-pigeon`),
        existingRef: null,
        existingChannel: null,
      }),
    );
    expect(out[REF_COOKIE].value).toBe(REF_A);
    // An unknown channel is no channel: the channel cookie is written as an
    // explicit clear, never with the junk value. (This assertion changed with
    // the desync fix below — it used to expect no channel cookie at all.)
    expect(out[REF_CHANNEL_COOKIE]).toMatchObject({ value: "", maxAge: 0 });
  });

  it("clears a stale channel when a ref arrives without one", () => {
    // The desync: someone lands on `/?via=x` (channel only), comes back weeks
    // later on a bare `/?ref=A`. Leaving `via=x` in place would credit A with
    // a share on a surface A never used. The pair must describe one event, so
    // the channel is cleared rather than inherited.
    const out = byName(
      referralCookiesToSet({
        searchParams: new URLSearchParams(`ref=${REF_A}`),
        existingRef: null,
        existingChannel: "x",
      }),
    );
    expect(out[REF_COOKIE].value).toBe(REF_A);
    expect(out[REF_CHANNEL_COOKIE]).toMatchObject({
      value: "",
      maxAge: 0,
      path: "/",
    });
  });

  it("overwrites a stale channel when the ref link carries its own", () => {
    const out = byName(
      referralCookiesToSet({
        searchParams: new URLSearchParams(`ref=${REF_A}&via=linkedin`),
        existingRef: null,
        existingChannel: "x",
      }),
    );
    expect(out[REF_COOKIE].value).toBe(REF_A);
    expect(out[REF_CHANNEL_COOKIE].value).toBe("linkedin");
  });

  it("treats a malformed existing ref as no attribution at all", () => {
    // A corrupted cookie must not lock the visitor out of ever being
    // attributed — it isn't a real first-touch, so a valid ref may claim it.
    const out = byName(
      referralCookiesToSet({
        searchParams: new URLSearchParams(`ref=${REF_A}`),
        existingRef: "garbage",
        existingChannel: null,
      }),
    );
    expect(out[REF_COOKIE].value).toBe(REF_A);
  });

  it("records a channel-only arrival so un-refed shares stay comparable", () => {
    const out = referralCookiesToSet({
      searchParams: new URLSearchParams("via=email"),
      existingRef: null,
      existingChannel: null,
    });
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe(REF_CHANNEL_COOKIE);
    expect(out[0].value).toBe("email");
  });

  it("applies first-touch to the channel-only case too", () => {
    const out = referralCookiesToSet({
      searchParams: new URLSearchParams("via=email"),
      existingRef: null,
      existingChannel: "x",
    });
    expect(out).toEqual([]);
  });

  it("sets nothing for the overwhelmingly common unattributed visit", () => {
    // This is the hot path — every organic pageview. It must not touch the
    // response at all, which is what lets the proxy return undefined and
    // leave Clerk's own response handling alone.
    expect(
      referralCookiesToSet({
        searchParams: new URLSearchParams(""),
        existingRef: null,
        existingChannel: null,
      }),
    ).toEqual([]);
    expect(referralCookiesToSet({ searchParams: null })).toEqual([]);
  });

  it("accepts Next's searchParams record shape, including array values", () => {
    const out = byName(
      referralCookiesToSet({
        searchParams: { ref: [REF_A, REF_B], via: "qr" },
      }),
    );
    // First value wins, matching parseRef — a stacked ?ref=A&ref=B must not
    // silently credit B.
    expect(out[REF_COOKIE].value).toBe(REF_A);
    expect(out[REF_CHANNEL_COOKIE].value).toBe("qr");
  });

  it("marks the cookies httpOnly, lax, site-wide and 30 days long", () => {
    const [c] = referralCookiesToSet({
      searchParams: new URLSearchParams(`ref=${REF_A}`),
      secure: true,
    });
    expect(c).toMatchObject({
      path: "/",
      sameSite: "lax",
      httpOnly: true,
      secure: true,
      maxAge: REF_COOKIE_MAX_AGE_SECONDS,
    });
    expect(REF_COOKIE_MAX_AGE_SECONDS).toBe(60 * 60 * 24 * 30);
  });

  it("leaves Secure off when not asked for, so dev over plain HTTP works", () => {
    const [c] = referralCookiesToSet({
      searchParams: new URLSearchParams(`ref=${REF_A}`),
    });
    expect(c.secure).toBe(false);
  });
});

describe("cookie value readers", () => {
  it("narrows a valid ref and rejects everything else", () => {
    expect(readRefCookieValue(REF_A)).toBe(REF_A);
    expect(readRefCookieValue("garbage")).toBeNull();
    expect(readRefCookieValue(undefined)).toBeNull();
    expect(readRefCookieValue(123)).toBeNull();
  });

  it("narrows a known channel and rejects everything else", () => {
    expect(readChannelCookieValue("linkedin")).toBe("linkedin");
    expect(readChannelCookieValue("carrier-pigeon")).toBeNull();
    expect(readChannelCookieValue(undefined)).toBeNull();
  });
});
