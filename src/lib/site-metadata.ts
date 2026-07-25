import type { Metadata } from "next";

/**
 * How the site names and describes itself in its chrome — the root metadata
 * and the homepage hero.
 *
 * The name alone ("The AI Bill of Rights") reads as *rights belonging to AI*
 * until you reach the articles, so the tagline has to travel with it anywhere
 * the title appears without surrounding context: the browser tab, search
 * results, and link-preview cards. Keep `SITE_TAGLINE` attached to the name in
 * every one of those surfaces.
 *
 * Note this is not yet the *only* place the name appears — several routes still
 * hardcode the string "AI Bill of Rights" in their own titles and copy (see
 * `src/app/about/page.tsx`, `src/app/resources/[slug]/page.tsx`,
 * `src/app/signatories/[id]/page.tsx`). A rename would need to visit those too.
 */
export const SITE_NAME = "The AI Bill of Rights";

export const SITE_TAGLINE = "A People's Demand for Human-Centered AI";

/** The name plus its disambiguating tagline — used wherever the title stands alone. */
export const SITE_TITLE = `${SITE_NAME} — ${SITE_TAGLINE}`;

export const SITE_DESCRIPTION =
  "Nine commitments we're demanding from every AI company, backed by the signatures of real people. Read the document, sign it, or mark up the next draft.";

export const PRODUCTION_ORIGIN = "https://ai-for-people.org";

/**
 * Canonical origin, always a parseable absolute URL.
 *
 * Unlike the other readers of `NEXT_PUBLIC_SITE_URL` (which only string-concat
 * it), this value feeds `new URL()` at module scope in the root layout — an
 * unparseable value there would throw during render and take down every route.
 * A misconfigured env var should degrade to the production origin, not to an
 * outage, so parse failures are warned about and swallowed.
 *
 * Falls through to `VERCEL_URL` so preview deploys, which don't get their own
 * `NEXT_PUBLIC_SITE_URL`, advertise themselves rather than production.
 */
export function getSiteUrl(): string {
  // VERCEL_URL is set on production deployments too, and it is the
  // per-deployment hostname rather than the custom domain — so only trust it
  // off production, or a missing NEXT_PUBLIC_SITE_URL would silently make the
  // live site advertise a *.vercel.app origin.
  const previewUrl =
    process.env.VERCEL_ENV !== "production" && process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : undefined;
  const configured = process.env.NEXT_PUBLIC_SITE_URL || previewUrl;
  if (!configured) return PRODUCTION_ORIGIN;

  try {
    const url = new URL(configured);
    // Parseability alone is not enough: `new URL("localhost:3000")` succeeds
    // with protocol "localhost:" and a null origin, and Next resolves relative
    // metadata URLs via `new URL(relative, metadataBase)` — which throws
    // against such an opaque-path base. Insist on a real web origin.
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error(`unsupported protocol ${url.protocol}`);
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    console.warn(
      `[site-metadata] Ignoring unusable site URL ${JSON.stringify(configured)}; falling back to ${PRODUCTION_ORIGIN}. Include the scheme, e.g. https://example.com`,
    );
    return PRODUCTION_ORIGIN;
  }
}

/**
 * Root metadata for the app shell. Child routes still set their own absolute
 * titles; this is the default they override.
 *
 * Next merges metadata *shallowly*: a child route that defines no `openGraph`
 * inherits this whole object. So everything here has to be true of any page
 * that doesn't override it — which is why there is no `url`. An absolute root
 * `og:url` would be inherited by `/about`, `/resources/[slug]`, and friends and
 * point their share cards at the homepage. `metadataBase` covers canonical
 * resolution without that hazard.
 */
export function buildRootMetadata(): Metadata {
  return {
    metadataBase: new URL(getSiteUrl()),
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    openGraph: {
      title: SITE_TITLE,
      description: SITE_DESCRIPTION,
      siteName: SITE_NAME,
      type: "website",
    },
    twitter: {
      card: "summary",
      title: SITE_TITLE,
      description: SITE_DESCRIPTION,
    },
  };
}

/**
 * Metadata for a route that needs its own title.
 *
 * Use this instead of hand-writing `openGraph`/`twitter` on a page. Next's
 * shallow merge cuts both ways: a route that omits `openGraph` inherits the
 * root's (and would share as the homepage), but a route that defines one
 * *replaces* the root's entirely — silently dropping `siteName` and `type`.
 * Routing every page through here keeps both halves of that hazard in one
 * place.
 *
 * Routes that deliberately want the site-level card (`/`) should not use this.
 */
export function buildPageMetadata({
  title,
  description,
  ogType = "website",
  imageUrl,
}: {
  title: string;
  description: string;
  ogType?: "website" | "profile";
  imageUrl?: string;
}): Metadata {
  const images = imageUrl
    ? [{ url: imageUrl, width: 1200, height: 630 }]
    : undefined;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      siteName: SITE_NAME,
      type: ogType,
      ...(images ? { images } : {}),
    },
    twitter: {
      card: imageUrl ? "summary_large_image" : "summary",
      title,
      description,
      ...(imageUrl ? { images: [imageUrl] } : {}),
    },
  };
}
