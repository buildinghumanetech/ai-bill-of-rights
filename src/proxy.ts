import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import {
  NextResponse,
  type NextFetchEvent,
  type NextRequest,
} from "next/server";
import {
  REF_CHANNEL_COOKIE,
  REF_COOKIE,
  referralCookiesToSet,
  type ReferralCookie,
} from "@/lib/referral/cookie";

const isProtectedRoute = createRouteMatcher([
  "/sign/profile(.*)",
  "/sign/consent(.*)",
  "/sign/complete(.*)",
  "/account(.*)",
  "/admin(.*)",
]);

const withClerk = clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

/**
 * Which share-attribution cookies this request should set, if any.
 *
 * Runs on every matched route, not just the homepage, because shared links
 * point at signer pages and article pages too. Returns an empty array for the
 * overwhelmingly common case — no attribution params, or a visitor who is
 * already attributed — so the response is left exactly as Clerk built it.
 */
function referralCookiesFor(req: NextRequest): ReferralCookie[] {
  return referralCookiesToSet({
    searchParams: req.nextUrl.searchParams,
    existingRef: req.cookies.get(REF_COOKIE)?.value ?? null,
    existingChannel: req.cookies.get(REF_CHANNEL_COOKIE)?.value ?? null,
    secure: process.env.NODE_ENV === "production",
  });
}

/**
 * Attach the cookies to whatever response came back — including a redirect.
 *
 * A `NextResponse` carries a cookie jar; a bare `Response` does not, so it is
 * re-wrapped (status, headers and body preserved) to get one. Clerk only ever
 * hands back `NextResponse`s today, but this way attribution does not quietly
 * evaporate if that ever changes.
 */
function applyReferralCookies(
  res: Response | void | null,
  cookies: ReferralCookie[],
): NextResponse {
  const target =
    res instanceof NextResponse
      ? res
      : res
        ? new NextResponse(res.body, res)
        : NextResponse.next();
  for (const c of cookies) target.cookies.set(c);
  return target;
}

/**
 * Stamp share attribution onto the visitor the moment they arrive.
 *
 * The cookies are computed BEFORE Clerk runs and applied to whatever Clerk
 * returns. That ordering is the whole point: `auth.protect()` throws its
 * sign-in redirect, so nothing after it inside the Clerk handler ever runs.
 * Capturing there meant an unauthenticated visitor landing on a protected
 * route with `?ref=` lost their attribution outright — and those are links
 * into the signing flow itself, the ones most likely to carry a ref.
 * Applying the cookies out here puts them on the redirect too, so attribution
 * survives the trip through sign-in and back.
 */
export default async function proxy(
  req: NextRequest,
  event: NextFetchEvent,
): Promise<Response | void | null> {
  const cookies = referralCookiesFor(req);
  const res = await withClerk(req, event);
  if (cookies.length === 0) return res;
  return applyReferralCookies(res, cookies);
}

export const config = {
  matcher: [
    // Skip Next internals and known static-asset extensions only. The
    // previous `.*\\..*` was too greedy — it also matched dotted route
    // segments like `/v/0.0.1`, so clerkMiddleware didn't run there and
    // `auth()` in the root layout threw on every dotted-version page.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|map|avif)).*)",
    "/(api|trpc)(.*)",
  ],
};
