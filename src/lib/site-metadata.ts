import type { Metadata } from "next";

/**
 * How the site names and describes itself in its chrome — the root metadata
 * and the homepage hero.
 *
 * The name alone ("The AI Bill of Rights") reads as *rights belonging to AI*
 * until you reach the articles, so the tagline has to travel with it wherever
 * the *site* title stands alone with no surrounding context — the tab, the
 * search result, the link-preview card. That is what `SITE_TITLE` is for; keep
 * the two attached there. Note this is not only the homepage: *every route
 * other than `/about`, `/resources/[slug]`, `/signatories/[id]`, `/scorecard`,
 * and `/scorecard/[slug]`* — the only five that define their own metadata —
 * inherits the root's and renders `SITE_TITLE` in the tab and in search. That
 * set is the missing-own-card backlog, and it includes `/bill-of-rights` and
 * `/signatories`, the document itself and the signer directory: the two most
 * shareable pages on the site.
 *
 * Keep that inventory honest. It went stale once already, when the scorecard
 * routes landed on a branch while this comment was written against another —
 * `tests/app/route-metadata.test.ts` now enumerates the same set, so the two
 * drift together or not at all.
 *
 * Subpage titles are the other case and deliberately do not carry the tagline:
 * "About — The AI Bill of Rights — A People's Demand for Human-Centered AI"
 * truncates to noise. They lead with the page name and carry `SITE_NAME` as
 * trailing context, which `buildPageMetadata` appends so the wording lives in
 * one place.
 *
 * Note this is not the *only* place the name appears. Route titles all derive
 * it from `SITE_NAME` now, but body copy still hardcodes the string — headings,
 * back-links, and prose in `src/app/about/page.tsx`,
 * `src/app/resources/[slug]/page.tsx`, and `src/app/signatories/[id]/page.tsx`.
 * A rename would need to visit those too.
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
 *
 * The image is the one thing here that inheritance makes *better* rather than
 * riskier. `/api/og` renders the document itself, not the homepage — it names
 * the site and its nine commitments and says nothing route-specific — so a
 * route that inherits it shares as the site, which is exactly right for the
 * ones that have no card of their own. That set currently includes
 * `/bill-of-rights` and `/signatories`, the two most shareable pages we have.
 * Contrast `og:url`, which is wrong the moment it is inherited. Any route that
 * wants a *different* picture overrides the whole `openGraph` block anyway,
 * via `buildPageMetadata`.
 */
export const OG_IMAGE_URL = "/api/og";

const OG_IMAGE_ALT =
  "The AI Bill of Rights — nine commitments demanded of every AI company";

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
      images: [
        { url: OG_IMAGE_URL, width: 1200, height: 630, alt: OG_IMAGE_ALT },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: SITE_TITLE,
      description: SITE_DESCRIPTION,
      images: [OG_IMAGE_URL],
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
 *
 * Pass a bare page title ("About", not "About — AI Bill of Rights"): the
 * site-name suffix is appended here so the separator and the spelling of the
 * name stay in one place and follow `SITE_NAME` through a rename. Set
 * `appendSiteName: false` for a title that already names the site in prose.
 */
export function buildPageMetadata({
  title: pageTitle,
  description,
  ogType = "website",
  imageUrl,
  url,
  appendSiteName = true,
}: {
  title: string;
  description: string;
  ogType?: "website" | "profile" | "article";
  imageUrl?: string;
  /**
   * Absolute `og:url` for this page. Safe here in a way it is not on the root:
   * the hazard the root avoids is *inheritance* — one url leaking onto every
   * route that defines no card. A page stating its own url is the correct use.
   */
  url?: string;
  appendSiteName?: boolean;
}): Metadata {
  if (
    process.env.NODE_ENV !== "production" &&
    !appendSiteName &&
    !pageTitle.toLowerCase().includes(SITE_NAME.toLowerCase())
  ) {
    // The opt-out exists for titles that already name the site in prose. Used
    // on a bare title it ships a card naming neither the site nor the tagline
    // — the exact failure this module exists to prevent. Enforced here rather
    // than only in tests, which cover just the routes someone remembered to add.
    //
    // Dev-only, unlike `getSiteUrl`'s warn: that one fires once at module scope
    // and reports a misconfiguration that changes rendered output. This reports
    // a copy problem only a developer can fix, and `/signatories/[id]` is
    // force-dynamic — in production it would log once per request, forever.
    console.warn(
      `[site-metadata] appendSiteName:false on ${JSON.stringify(pageTitle)}, which does not contain ${JSON.stringify(SITE_NAME)}. Use the opt-out only for titles that already name the site.`,
    );
  }
  const title = appendSiteName ? `${pageTitle} — ${SITE_NAME}` : pageTitle;
  // Fall back to the site card rather than shipping no image. A route that
  // defines no `openGraph` at all inherits the root's — image included — so
  // without this default, merely *adopting this helper* would downgrade such a
  // route to a bare text card. That is not hypothetical: `/about` and
  // `/resources/[slug]` regressed exactly that way. `/api/og` describes the
  // document rather than any one page, so it is always a truthful fallback.
  const image = imageUrl ?? OG_IMAGE_URL;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      siteName: SITE_NAME,
      type: ogType,
      ...(url ? { url } : {}),
      images: [{ url: image, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}
