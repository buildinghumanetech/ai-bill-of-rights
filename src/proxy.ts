import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import {
  REF_CHANNEL_COOKIE,
  REF_COOKIE,
  referralCookiesToSet,
} from "@/lib/referral/cookie";

const isProtectedRoute = createRouteMatcher([
  "/sign/profile(.*)",
  "/sign/consent(.*)",
  "/sign/complete(.*)",
  "/account(.*)",
  "/admin(.*)",
]);

/**
 * Stamp share attribution onto the visitor the moment they arrive.
 *
 * Runs on every matched route, not just the homepage, because shared links
 * point at signer pages and article pages too. Returns undefined when there is
 * nothing to record so Clerk's default response handling stays untouched.
 */
function captureReferral(req: NextRequest): NextResponse | undefined {
  const cookies = referralCookiesToSet({
    searchParams: req.nextUrl.searchParams,
    existingRef: req.cookies.get(REF_COOKIE)?.value ?? null,
    existingChannel: req.cookies.get(REF_CHANNEL_COOKIE)?.value ?? null,
    secure: process.env.NODE_ENV === "production",
  });
  if (cookies.length === 0) return undefined;

  const res = NextResponse.next();
  for (const c of cookies) res.cookies.set(c);
  return res;
}

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
  return captureReferral(req);
});

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
