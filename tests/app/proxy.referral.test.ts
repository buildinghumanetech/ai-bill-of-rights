/**
 * The proxy's job in the referral story: turn `?ref=`/`?via=` on an incoming
 * request into cookies on the outgoing response, whatever that response is.
 *
 * The case these tests exist for is the protected route. `auth.protect()`
 * throws its sign-in redirect, which means anything sequenced after it inside
 * the Clerk handler never runs at all — attribution used to be captured there
 * and was therefore lost for every unauthenticated visitor arriving on a
 * shared link into the signing flow. The fix computes the cookies before Clerk
 * runs and applies them to Clerk's response, redirect included.
 *
 * Clerk is mocked rather than run for real (it needs API keys and a network),
 * but the mock reproduces the control flow that matters: `protect()` throws,
 * and clerkMiddleware catches that and converts it into a redirect response —
 * see handleControlFlowErrors in @clerk/nextjs' clerkMiddleware.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { REF_CHANNEL_COOKIE, REF_COOKIE } from "@/lib/referral/cookie";

const state = vi.hoisted(() => ({
  signedIn: false,
  /** Set when the mocked Clerk returns something that isn't a NextResponse. */
  plainResponse: false,
  protectCalls: 0,
}));

const PROTECT_REDIRECT = vi.hoisted(() => Symbol("clerk:redirect-to-sign-in"));

vi.mock("@clerk/nextjs/server", () => ({
  createRouteMatcher:
    (patterns: string[]) =>
    (req: NextRequest): boolean =>
      patterns.some((p) =>
        new RegExp(`^${p}$`).test(req.nextUrl.pathname),
      ),
  clerkMiddleware:
    (handler: (auth: unknown, req: NextRequest, evt: unknown) => unknown) =>
    async (req: NextRequest, evt: unknown) => {
      const auth = {
        protect: async () => {
          state.protectCalls += 1;
          if (!state.signedIn) throw PROTECT_REDIRECT;
        },
      };
      try {
        const result = await handler(auth, req, evt);
        if (result) return result as Response;
        return state.plainResponse
          ? new Response("ok", { status: 200, headers: { "x-clerk": "1" } })
          : NextResponse.next();
      } catch (err) {
        // What clerkMiddleware does with a thrown protect(): swallow it and
        // return a redirect the handler never gets to see.
        if (err === PROTECT_REDIRECT) {
          return NextResponse.redirect(new URL("/sign-in", req.url));
        }
        throw err;
      }
    },
}));

const REF_A = "11111111-2222-3333-4444-555555555555";

async function run(url: string, cookieHeader?: string) {
  const proxy = (await import("@/proxy")).default;
  const req = new NextRequest(url, {
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
  });
  return (await proxy(req, {} as never)) as NextResponse;
}

function setCookies(res: Response): string[] {
  return res.headers.getSetCookie();
}

beforeEach(() => {
  state.signedIn = false;
  state.plainResponse = false;
  state.protectCalls = 0;
});

// NODE_ENV is stubbed by the Secure-flag tests below; put it back so the value
// does not leak into whatever test file shares this worker process.
afterEach(() => {
  vi.unstubAllEnvs();
});

/** The raw `Set-Cookie` line for a given cookie name, as sent on the wire. */
function setCookieFor(res: Response, name: string): string | undefined {
  return setCookies(res).find((c) => c.startsWith(`${name}=`));
}

describe("proxy referral capture", () => {
  it("keeps attribution on the sign-in redirect from a protected route", async () => {
    // The regression under test: `/sign/profile?ref=A` while signed out.
    const res = await run(`https://example.com/sign/profile?ref=${REF_A}&via=x`);

    expect(state.protectCalls).toBe(1);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/sign-in");
    expect(res.cookies.get(REF_COOKIE)?.value).toBe(REF_A);
    expect(res.cookies.get(REF_CHANNEL_COOKIE)?.value).toBe("x");
  });

  it("keeps attribution on a protected route for a signed-in visitor", async () => {
    state.signedIn = true;
    const res = await run(`https://example.com/account?ref=${REF_A}`);

    expect(state.protectCalls).toBe(1);
    expect(res.cookies.get(REF_COOKIE)?.value).toBe(REF_A);
  });

  it("captures attribution on a public route", async () => {
    const res = await run(`https://example.com/signatories/abc?ref=${REF_A}&via=email`);

    expect(state.protectCalls).toBe(0);
    expect(res.cookies.get(REF_COOKIE)?.value).toBe(REF_A);
    expect(res.cookies.get(REF_CHANNEL_COOKIE)?.value).toBe("email");
  });

  it("leaves Clerk's response untouched on an ordinary unattributed visit", async () => {
    // The hot path — every organic pageview. Nothing to record, so the
    // response must come back exactly as Clerk built it.
    const res = await run("https://example.com/");
    expect(setCookies(res)).toEqual([]);
  });

  it("does not re-attribute a visitor who already has a ref cookie", async () => {
    const res = await run(
      `https://example.com/?ref=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee`,
      `${REF_COOKIE}=${REF_A}`,
    );
    expect(setCookies(res)).toEqual([]);
  });

  it("clears a stale channel cookie alongside the new ref", async () => {
    // Same desync the cookie module guards against, end to end through the
    // proxy: an old `via` must not be inherited by a new ref.
    const res = await run(
      `https://example.com/?ref=${REF_A}`,
      `${REF_CHANNEL_COOKIE}=x`,
    );
    expect(res.cookies.get(REF_COOKIE)?.value).toBe(REF_A);
    expect(res.cookies.get(REF_CHANNEL_COOKIE)?.value).toBe("");
    expect(
      setCookies(res).find((c) => c.startsWith(REF_CHANNEL_COOKIE)),
    ).toMatch(/Max-Age=0/i);
  });

  it("marks the attribution cookies Secure in production", async () => {
    // The one proxy line whose regression is silent. `secure` is derived from
    // NODE_ENV, and every other test here passes whether the flag is on or
    // off — the cookies still land, they just travel over plain HTTP in prod
    // where anyone on the wire can lift someone's attribution. So assert on
    // the header as sent, not on the cookie jar (which hides the flag).
    vi.stubEnv("NODE_ENV", "production");
    const res = await run(`https://example.com/?ref=${REF_A}&via=x`);

    expect(setCookieFor(res, REF_COOKIE)).toMatch(/;\s*Secure\b/i);
    expect(setCookieFor(res, REF_CHANNEL_COOKIE)).toMatch(/;\s*Secure\b/i);
  });

  it("leaves Secure off outside production, so dev over plain HTTP works", async () => {
    // The companion: a blanket `secure: true` would be just as broken, since
    // the dev server is http://localhost and the browser would drop the
    // cookies outright — attribution silently missing for every local run.
    vi.stubEnv("NODE_ENV", "development");
    const res = await run(`https://example.com/?ref=${REF_A}&via=x`);

    const ref = setCookieFor(res, REF_COOKIE);
    expect(ref).toBeDefined();
    expect(ref).not.toMatch(/;\s*Secure\b/i);
    expect(setCookieFor(res, REF_CHANNEL_COOKIE)).not.toMatch(/;\s*Secure\b/i);
  });

  it("still sets cookies when the upstream response is a plain Response", async () => {
    // Defence for the day Clerk stops handing back a NextResponse: a bare
    // Response has no cookie jar, so it gets re-wrapped rather than dropped.
    state.plainResponse = true;
    const res = await run(`https://example.com/?ref=${REF_A}`);

    expect(res.status).toBe(200);
    expect(res.headers.get("x-clerk")).toBe("1");
    expect(await res.text()).toBe("ok");
    expect(res.cookies.get(REF_COOKIE)?.value).toBe(REF_A);
  });
});
