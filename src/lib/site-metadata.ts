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
  const configured =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined);
  if (!configured) return PRODUCTION_ORIGIN;

  try {
    return new URL(configured).toString().replace(/\/$/, "");
  } catch {
    console.warn(
      `[site-metadata] Ignoring unparseable site URL ${JSON.stringify(configured)}; falling back to ${PRODUCTION_ORIGIN}. Include the scheme, e.g. https://example.com`,
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
