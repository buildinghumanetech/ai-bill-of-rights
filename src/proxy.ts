import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isProtectedRoute = createRouteMatcher([
  "/sign/profile(.*)",
  "/sign/consent(.*)",
  "/sign/complete(.*)",
  "/account(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
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
