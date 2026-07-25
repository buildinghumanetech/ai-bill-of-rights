import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TAGLINE,
  SITE_TITLE,
  buildRootMetadata,
  getSiteUrl,
} from "@/lib/site-metadata";

const ORIGINAL_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL;

afterEach(() => {
  if (ORIGINAL_SITE_URL === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = ORIGINAL_SITE_URL;
});

describe("SITE_TITLE", () => {
  it("carries both the name and the disambiguating tagline", () => {
    expect(SITE_TITLE).toContain(SITE_NAME);
    expect(SITE_TITLE).toContain(SITE_TAGLINE);
  });

  it("leads with the name so it stays recognizable when truncated", () => {
    expect(SITE_TITLE.startsWith(SITE_NAME)).toBe(true);
  });
});

describe("buildRootMetadata", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://example.test";
  });

  it("never lets the bare name travel alone on a title surface", () => {
    const meta = buildRootMetadata();
    const titles = [
      meta.title,
      (meta.openGraph as { title?: string } | undefined)?.title,
      (meta.twitter as { title?: string } | undefined)?.title,
    ];

    for (const title of titles) {
      expect(typeof title).toBe("string");
      expect(title).toContain(SITE_TAGLINE);
    }
  });

  it("keeps the document, OG, and Twitter titles identical", () => {
    const meta = buildRootMetadata();
    const og = meta.openGraph as { title?: string };
    const twitter = meta.twitter as { title?: string };
    expect(og.title).toBe(meta.title);
    expect(twitter.title).toBe(meta.title);
  });

  it("describes what the document is rather than repeating the tagline", () => {
    const meta = buildRootMetadata();
    expect(meta.description).toBe(SITE_DESCRIPTION);
    expect(meta.description).not.toBe(SITE_TAGLINE);
    // The card should say what signing this means, not just restate the title.
    expect(SITE_DESCRIPTION.length).toBeGreaterThan(SITE_TAGLINE.length);
  });

  it("sets a summary card on Twitter and a website OG type", () => {
    const meta = buildRootMetadata();
    expect((meta.twitter as { card?: string }).card).toBe("summary");
    expect((meta.openGraph as { type?: string }).type).toBe("website");
    expect((meta.openGraph as { siteName?: string }).siteName).toBe(SITE_NAME);
  });

  it("derives metadataBase and the OG url from NEXT_PUBLIC_SITE_URL", () => {
    const meta = buildRootMetadata();
    expect(new URL(String(meta.metadataBase)).origin).toBe(
      "https://example.test",
    );
    expect((meta.openGraph as { url?: string }).url).toBe("https://example.test");
  });
});

describe("getSiteUrl", () => {
  it("falls back to the production origin when unset", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    expect(getSiteUrl()).toBe("https://ai-for-people.org");
    expect(() => new URL(getSiteUrl())).not.toThrow();
  });
});
