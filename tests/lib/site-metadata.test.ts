import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  OG_IMAGE_URL,
  PRODUCTION_ORIGIN,
  SITE_DESCRIPTION,
  SITE_TAGLINE,
  SITE_TITLE,
  buildPageMetadata,
  buildRootMetadata,
  withoutEmDashes,
  getSiteUrl,
} from "@/lib/site-metadata";

const ORIGINAL_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL;

afterEach(() => {
  if (ORIGINAL_SITE_URL === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = ORIGINAL_SITE_URL;
});

describe("SITE_TITLE and SITE_DESCRIPTION", () => {
  it("are the new name and line, with no em dashes", () => {
    expect(SITE_TITLE).toBe("The People's AI Bill of Rights");
    expect(SITE_DESCRIPTION).toBe(
      "The future is ours to name. Make your voice heard. Sign at theaibill.org",
    );
    expect(SITE_TITLE + SITE_DESCRIPTION).not.toContain("\u2014");
  });
});

describe("withoutEmDashes", () => {
  it("turns an em dash, spaced or not, into a comma", () => {
    expect(withoutEmDashes("GDPR Article 22 \u2014 Automated Decisions")).toBe(
      "GDPR Article 22, Automated Decisions",
    );
    expect(withoutEmDashes("a\u2014b")).toBe("a, b");
    expect(withoutEmDashes("no dashes")).toBe("no dashes");
  });
});

describe("buildRootMetadata", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://example.test";
  });

  it("titles every surface The People's AI Bill of Rights", () => {
    const meta = buildRootMetadata();
    const titles = [
      meta.title,
      (meta.openGraph as { title?: string } | undefined)?.title,
      (meta.twitter as { title?: string } | undefined)?.title,
    ];
    for (const title of titles) {
      expect(title).toBe("The People's AI Bill of Rights");
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

  it("sets a large-image card on Twitter and a website OG type", () => {
    const meta = buildRootMetadata();
    expect((meta.twitter as { card?: string }).card).toBe(
      "summary_large_image",
    );
    expect((meta.openGraph as { type?: string }).type).toBe("website");
    expect((meta.openGraph as { siteName?: string }).siteName).toBe(SITE_TITLE);
  });

  it("carries og-v2.png at 1200x630 on both OG and Twitter", () => {
    const meta = buildRootMetadata();
    const card = {
      url: "/og-v2.png",
      width: 1200,
      height: 630,
      alt: expect.stringContaining("The future is ours to name."),
    };
    expect(OG_IMAGE_URL).toBe("/og-v2.png");
    expect((meta.openGraph as { images?: unknown }).images).toEqual([card]);
    expect((meta.twitter as { images?: unknown }).images).toEqual([card]);
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
  const ORIGINAL_VERCEL_ENV = process.env.VERCEL_ENV;

  afterEach(() => {
    if (ORIGINAL_VERCEL_URL === undefined) delete process.env.VERCEL_URL;
    else process.env.VERCEL_URL = ORIGINAL_VERCEL_URL;
    if (ORIGINAL_VERCEL_ENV === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = ORIGINAL_VERCEL_ENV;
  });

  // VERCEL_ENV is load-bearing here, so every case pins it rather than
  // depending on whatever the ambient environment happens to have.
  beforeEach(() => {
    delete process.env.VERCEL_ENV;
    delete process.env.VERCEL_URL;
  });

  it("falls back to the production origin when nothing is configured", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    expect(getSiteUrl()).toBe(PRODUCTION_ORIGIN);
  });

  it("prefers NEXT_PUBLIC_SITE_URL over VERCEL_URL", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://explicit.test";
    process.env.VERCEL_URL = "preview.vercel.app";
    expect(getSiteUrl()).toBe("https://explicit.test");
  });

  it("uses VERCEL_URL so previews advertise themselves, not production", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    process.env.VERCEL_ENV = "preview";
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

  it("rejects a scheme-shaped value that parses but has no real origin", () => {
    // `new URL("localhost:3000")` does NOT throw — it parses as protocol
    // "localhost:" with an opaque path and a null origin. Next resolves
    // relative metadata URLs via `new URL(relative, metadataBase)`, which
    // throws against such a base, so /signatories/[id] would break.
    process.env.NEXT_PUBLIC_SITE_URL = "localhost:3000";
    expect(getSiteUrl()).toBe(PRODUCTION_ORIGIN);
    const base = new URL(String(buildRootMetadata().metadataBase));
    expect(() => new URL("/api/og/signer/1", base)).not.toThrow();
  });

  it("always returns an http(s) URL with a real origin and no trailing slash", () => {
    for (const value of [
      "https://ok.test/",
      "not a url",
      "",
      "//nope",
      "localhost:3000",
      "127.0.0.1:3000",
      "www.ai-for-people.org",
      "ftp://files.test",
    ]) {
      process.env.NEXT_PUBLIC_SITE_URL = value;
      const url = getSiteUrl();
      const parsed = new URL(url);
      expect(["http:", "https:"]).toContain(parsed.protocol);
      expect(parsed.origin).not.toBe("null");
      expect(url.endsWith("/")).toBe(false);
    }
  });

  it("ignores VERCEL_URL on production so the custom domain wins", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    process.env.VERCEL_ENV = "production";
    process.env.VERCEL_URL = "ai-bill-of-rights-9fk2x1.vercel.app";
    expect(getSiteUrl()).toBe(PRODUCTION_ORIGIN);
  });
});

describe("buildPageMetadata", () => {
  it("keeps siteName and type, which a hand-written block would drop", () => {
    // Next's shallow merge means a child openGraph replaces the root's
    // wholesale — these fields are not inherited.
    const og = buildPageMetadata({ title: "T", description: "D" })
      .openGraph as { siteName?: string; type?: string };
    expect(og.siteName).toBe(SITE_TITLE);
    expect(og.type).toBe("website");
  });

  it("uses the page's own title and description, not the site's", () => {
    const meta = buildPageMetadata({ title: "About", description: "Who we are" });
    const og = meta.openGraph as { title?: string; description?: string };
    const tw = meta.twitter as { title?: string; description?: string };
    for (const value of [meta.title, og.title, tw.title]) {
      expect(value).toBe(`About | ${SITE_TITLE}`);
      // The page title leads; the site name trails it as context, and the
      // homepage's tagline stays off subpages entirely.
      expect(String(value).startsWith("About")).toBe(true);
      expect(value).not.toContain(SITE_TAGLINE);
    }
    expect(og.description).toBe("Who we are");
    expect(tw.description).toBe("Who we are");
  });

  it("appends the site title from SITE_TITLE so a rename carries through", () => {
    const meta = buildPageMetadata({ title: "Page", description: "D" });
    expect(meta.title).toBe(`Page | ${SITE_TITLE}`);
  });

  it("strips em dashes from titles and descriptions that come from content", () => {
    const meta = buildPageMetadata({
      title: "GDPR Article 22 \u2014 Automated Decisions",
      description: "Rights \u2014 and remedies",
    });
    const og = meta.openGraph as { title?: string; description?: string };
    for (const value of [meta.title, meta.description, og.title, og.description]) {
      expect(String(value)).not.toContain("\u2014");
    }
  });

  it("leaves the title alone when it already names the site in prose", () => {
    const meta = buildPageMetadata({
      title: `Ada signed ${SITE_TITLE}`,
      description: "D",
      appendSiteName: false,
    });
    expect(meta.title).toBe(`Ada signed ${SITE_TITLE}`);
    // No doubled site name. Counted by splitting rather than with a RegExp
    // built from SITE_TITLE: this is the rename-safety test, and a future name
    // containing "(", ".", or "?" would make an unescaped pattern throw or
    // match the wrong thing exactly when a rename happens.
    expect(String(meta.title).split(SITE_TITLE).length - 1).toBe(1);
  });

  it("warns when the opt-out is used on a title that does not name the site", () => {
    // The route-level test only covers routes someone remembered to add to it;
    // the invariant belongs to the helper, so it is enforced here too.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      buildPageMetadata({
        title: "Draft archived",
        description: "D",
        appendSiteName: false,
      });
      expect(warn).toHaveBeenCalledOnce();
      expect(String(warn.mock.calls[0][0])).toContain("Draft archived");

      warn.mockClear();
      buildPageMetadata({
        title: `Ada signed ${SITE_TITLE}`,
        description: "D",
        appendSiteName: false,
      });
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  // This asserted `card: "summary"` and no images for a page that supplies no
  // image of its own. That was written when the root had no image either, so
  // there was nothing to fall back TO. There is now, and the old contract had
  // a sharp edge: a route that previously defined no `openGraph` at all was
  // *inheriting* the root card, so merely adopting this helper silently
  // downgraded it to a bare text card. `/about` and `/resources/[slug]` both
  // regressed exactly that way. Falling back to the site card means opting
  // into the helper can never cost a route its picture.
  it("falls back to the site card so no route ships an imageless preview", () => {
    const plain = buildPageMetadata({ title: "T", description: "D" });
    const card = {
      url: OG_IMAGE_URL,
      width: 1200,
      height: 630,
      alt: expect.stringContaining("The future is ours to name."),
    };
    expect((plain.openGraph as { images?: unknown }).images).toEqual([card]);
    expect((plain.twitter as { card?: string }).card).toBe(
      "summary_large_image",
    );
    expect((plain.twitter as { images?: unknown }).images).toEqual([card]);
  });

  it("prefers the page's own image over the site card", () => {
    const withImage = buildPageMetadata({
      title: "T",
      description: "D",
      ogType: "profile",
      imageUrl: "/api/og/signer/1",
    });
    expect((withImage.twitter as { card?: string }).card).toBe(
      "summary_large_image",
    );
    expect((withImage.openGraph as { type?: string }).type).toBe("profile");
    expect((withImage.openGraph as { images?: unknown[] }).images).toEqual([
      { url: "/api/og/signer/1", width: 1200, height: 630 },
    ]);
  });
});
