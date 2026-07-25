import type { Metadata } from "next";

/**
 * Single source of truth for how the site names and describes itself.
 *
 * The name alone ("The AI Bill of Rights") reads as *rights belonging to AI*
 * until you reach the articles, so the tagline has to travel with it anywhere
 * the title appears without surrounding context: the browser tab, search
 * results, and link-preview cards. Keep `SITE_TAGLINE` attached to the name in
 * every one of those surfaces.
 */
export const SITE_NAME = "The AI Bill of Rights";

export const SITE_TAGLINE = "A People's Demand for Human-Centered AI";

/** The name plus its disambiguating tagline — used wherever the title stands alone. */
export const SITE_TITLE = `${SITE_NAME} — ${SITE_TAGLINE}`;

export const SITE_DESCRIPTION =
  "Nine commitments we're demanding from every AI company, backed by the signatures of real people. Read the document, sign it, or mark up the next draft.";

/** Canonical origin. Mirrors the fallback used by the signer/invite email links. */
export function getSiteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "https://ai-for-people.org";
}

/**
 * Root metadata for the app shell. Child routes still set their own absolute
 * titles; this is the default they override.
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
      url: getSiteUrl(),
      type: "website",
    },
    twitter: {
      card: "summary",
      title: SITE_TITLE,
      description: SITE_DESCRIPTION,
    },
  };
}
