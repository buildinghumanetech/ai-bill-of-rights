import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  PRODUCTION_ORIGIN,
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
    // Search results truncate around 160 characters; stay inside that window
    // so the call to action at the end of the sentence survives.
    expect(SITE_DESCRIPTION.length).toBeLessThanOrEqual(160);
  });

  it("omits an absolute og:url so child routes cannot inherit it", () => {
    // Next merges metadata shallowly: any route without its own `openGraph`
    // inherits this object wholesale. An absolute root url would make /about
    // and /resources/[slug] advertise themselves as the homepage.
    const og = buildRootMetadata().openGraph as { url?: unknown };
    expect(og.url).toBeUndefined();
  });

  it("sets a summary card on Twitter and a website OG type", () => {
    const meta = buildRootMetadata();
    expect((meta.twitter as { card?: string }).card).toBe("summary");
    expect((meta.openGraph as { type?: string }).type).toBe("website");
    expect((meta.openGraph as { siteName?: string }).siteName).toBe(SITE_NAME);
  });

  it("derives metadataBase from NEXT_PUBLIC_SITE_URL", () => {
    const meta = buildRootMetadata();
    expect(new URL(String(meta.metadataBase)).origin).toBe(
      "https://example.test",
    );
  });
});

describe("getSiteUrl", () => {
  const ORIGINAL_VERCEL_URL = process.env.VERCEL_URL;

  afterEach(() => {
    if (ORIGINAL_VERCEL_URL === undefined) delete process.env.VERCEL_URL;
    else process.env.VERCEL_URL = ORIGINAL_VERCEL_URL;
  });

  it("falls back to the production origin when nothing is configured", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.VERCEL_URL;
    expect(getSiteUrl()).toBe(PRODUCTION_ORIGIN);
  });

  it("prefers NEXT_PUBLIC_SITE_URL over VERCEL_URL", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://explicit.test";
    process.env.VERCEL_URL = "preview.vercel.app";
    expect(getSiteUrl()).toBe("https://explicit.test");
  });

  it("uses VERCEL_URL so previews advertise themselves, not production", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    process.env.VERCEL_URL = "preview.vercel.app";
    expect(getSiteUrl()).toBe("https://preview.vercel.app");
  });

  it("degrades to production instead of throwing on a scheme-less value", () => {
    // This value reaches `new URL()` at module scope in the root layout, so
    // throwing here would take down every route rather than one bad link.
    process.env.NEXT_PUBLIC_SITE_URL = "ai-for-people.org";
    expect(() => getSiteUrl()).not.toThrow();
    expect(getSiteUrl()).toBe(PRODUCTION_ORIGIN);
    expect(() => buildRootMetadata()).not.toThrow();
  });

  it("always returns a parseable absolute URL with no trailing slash", () => {
    for (const value of ["https://ok.test/", "not a url", "", "//nope"]) {
      process.env.NEXT_PUBLIC_SITE_URL = value;
      const url = getSiteUrl();
      expect(() => new URL(url)).not.toThrow();
      expect(url.endsWith("/")).toBe(false);
    }
  });
});
