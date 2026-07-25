import { describe, it, expect, vi } from "vitest";

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

  it("exports a complete openGraph block with a 1200x630 image", () => {
    const og = metadata.openGraph;
    expect(og).toBeTruthy();
    expect(og!.title).toBeTruthy();
    expect(og!.description).toBeTruthy();
    expect(og!.siteName).toBe("AI Bill of Rights");
    expect((og as { type?: string }).type).toBe("website");
    expect(og!.locale).toBe("en_US");

    const images = og!.images as Array<{
      url: string;
      width: number;
      height: number;
      alt: string;
    }>;
    expect(images).toHaveLength(1);
    expect(images[0].url).toBe("/api/og");
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
    expect(tw).toBeTruthy();
    expect(tw.card).toBe("summary_large_image");
    expect(tw.title).toBeTruthy();
    expect(tw.description).toBeTruthy();
    expect(tw.images).toEqual(["/api/og"]);
  });

  it("keeps the People's Demand framing in the shared description", () => {
    expect(metadata.description).toContain("Human-Centered AI");
    expect(metadata.openGraph!.description).toBe(metadata.description);
  });
});
