import { describe, it, expect, vi } from "vitest";
import {
  OG_IMAGE_URL,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TITLE,
} from "@/lib/site-metadata";

// The root layout pulls in fonts, Clerk and global CSS; none of that matters
// for the metadata export, so stub the module graph down to nothing.
vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "--font-geist-sans" }),
  Geist_Mono: () => ({ variable: "--font-geist-mono" }),
}));
vi.mock("@clerk/nextjs", () => ({ ClerkProvider: () => null }));
vi.mock("@/components/MyAccountButton", () => ({ MyAccountButton: () => null }));
vi.mock("@/lib/db/queries", () => ({ getSignatureCount: vi.fn() }));
vi.mock("@/app/LiveSignersProvider", () => ({ LiveSignersProvider: () => null }));
vi.mock("@/app/LiveSignerBanner", () => ({ default: () => null }));

import { metadata } from "@/app/layout";

/**
 * What the ROUTE exports, as opposed to what `buildRootMetadata()` returns.
 *
 * `tests/lib/site-metadata.test.ts` owns the shape of the helper. This file
 * exists for one narrower reason: the layout has to actually *use* it. The
 * layout used to hand-roll this whole block, and hand-rolled metadata is how
 * two spellings of the site name drifted apart in the first place — so these
 * assertions compare the exported object against the shared constants rather
 * than against literals, and go red if anyone re-inlines it.
 */
describe("root metadata", () => {
  it("sets metadataBase so relative OG image URLs never resolve to a *.vercel.app host", () => {
    const base = metadata.metadataBase;
    if (!(base instanceof URL)) throw new Error("metadataBase is not a URL");
    expect(base.origin).toBe(
      process.env.NEXT_PUBLIC_SITE_URL
        ? new URL(process.env.NEXT_PUBLIC_SITE_URL).origin
        : "https://ai-for-people.org",
    );
  });

  it("comes from the shared helper rather than a hand-rolled literal", () => {
    expect(metadata.title).toBe(SITE_TITLE);
    expect(metadata.description).toBe(SITE_DESCRIPTION);
    expect(metadata.openGraph!.siteName).toBe(SITE_NAME);
    expect(metadata.openGraph!.title).toBe(SITE_TITLE);
    expect(metadata.openGraph!.description).toBe(SITE_DESCRIPTION);
  });

  it("exports an openGraph image at the size /api/og actually renders", () => {
    const images = metadata.openGraph!.images as Array<{
      url: string;
      width: number;
      height: number;
      alt: string;
    }>;
    expect(images).toHaveLength(1);
    expect(images[0].url).toBe(OG_IMAGE_URL);
    expect(images[0].width).toBe(1200);
    expect(images[0].height).toBe(630);
    expect(images[0].alt).toBeTruthy();
  });

  it("exports a summary_large_image twitter card pointing at the same image", () => {
    const tw = metadata.twitter as {
      card?: string;
      title?: string;
      description?: string;
      images?: string[];
    };
    expect(tw.card).toBe("summary_large_image");
    expect(tw.title).toBe(SITE_TITLE);
    expect(tw.description).toBe(SITE_DESCRIPTION);
    expect(tw.images).toEqual([OG_IMAGE_URL]);
  });

  it("keeps the People's Demand framing on the card that stands alone", () => {
    // The tagline rides on the TITLE, not the description — a card showing
    // only the name reads as rights belonging to AI. See site-metadata.ts.
    expect(metadata.openGraph!.title).toContain("Human-Centered AI");
  });
});
