import { describe, expect, it, vi } from "vitest";
import { getResource, listResourceSlugs } from "@/lib/resources";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE } from "@/lib/site-metadata";

/**
 * Guards the shallow-merge hazard at the route level.
 *
 * Next merges metadata shallowly, so a route that sets its own `title` but no
 * `openGraph` silently inherits the root's — and shares as if it were the
 * homepage. `buildPageMetadata()` exists to prevent that, but nothing stopped a
 * route from going back to a bare `{ title, description }` until these tests.
 */

// File-wide, despite reading like it belongs to the /signatories/[id] block:
// vi.mock is hoisted to the top of the module regardless of where it is
// written, so nesting it inside a describe would only look scoped.
//
// The factory covers every export rather than the one or two this file uses,
// but deliberately does NOT pass the rest through to the real implementations.
// `queries.ts` resolves its db lazily, so a real export would not fail at
// import — it would fail at call time with "DATABASE_URL is not set", or worse,
// succeed against whatever Neon database the developer's .env points at.
// Metadata tests must never touch a network, so un-stubbed queries throw a
// message that names the missing stub instead.
const getSignerById = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/queries", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/queries")>();
  return Object.fromEntries(
    Object.keys(actual).map((name) => [
      name,
      name === "getSignerById"
        ? getSignerById
        : () => {
            throw new Error(
              `${name}() is not stubbed in route-metadata.test.ts — add a stub; these tests must not reach the database.`,
            );
          },
    ]),
  );
});

type Og = {
  title?: string;
  description?: string;
  siteName?: string;
  type?: string;
  images?: unknown[];
};
type Tw = { title?: string; description?: string; card?: string };

function expectOwnCard(meta: {
  title?: unknown;
  description?: unknown;
  openGraph?: unknown;
  twitter?: unknown;
}) {
  const og = meta.openGraph as Og | undefined;
  const tw = meta.twitter as Tw | undefined;

  expect(og, "route defines no openGraph — it will inherit the homepage's").toBeDefined();
  expect(tw, "route defines no twitter block — it will inherit the homepage's").toBeDefined();

  // The card must describe this page, not the site. Both halves matter: a
  // hand-written block with a page title but the homepage blurb is the same
  // wrong-card symptom.
  expect(og!.title).toBe(meta.title);
  expect(og!.title).not.toBe(SITE_TITLE);
  expect(tw!.title).toBe(meta.title);
  expect(og!.description).toBe(meta.description);
  expect(og!.description).not.toBe(SITE_DESCRIPTION);
  expect(tw!.description).toBe(meta.description);

  // The title must name the site somewhere. `appendSiteName: false` is an
  // unguarded opt-out otherwise: a route could pass a bare "Signer not found"
  // and ship a card identifying neither the page's site nor its tagline, with
  // every other assertion here still passing.
  expect(String(meta.title)).toContain(SITE_NAME);

  // ...while still keeping the fields a child block would otherwise drop.
  expect(og!.siteName).toBe(SITE_NAME);
  expect(og!.type).toBeDefined();
  expect(tw!.card).toBeDefined();
}

describe("/about metadata", () => {
  it("carries its own share card", async () => {
    const { metadata } = await import("@/app/about/page");
    expectOwnCard(metadata);
    expect(metadata.title).toBe(`About — ${SITE_NAME}`);
  });
});

describe("/resources/[slug] metadata", () => {
  it("carries its own share card for a real resource", async () => {
    // Derive the slug rather than hardcoding one: a hardcoded slug that gets
    // renamed away would silently turn this into a second copy of the
    // not-found test — still green, no longer covering the real-resource path.
    const [slug] = listResourceSlugs();
    expect(slug, "no resources to test against").toBeDefined();
    const resource = getResource(slug)!;

    const { generateMetadata } = await import("@/app/resources/[slug]/page");
    const meta = await generateMetadata({
      params: Promise.resolve({ slug }),
    });
    expectOwnCard(meta);
    expect(meta.title).toBe(`${resource.title} — ${SITE_NAME}`);
  });

  it("carries its own share card for an unknown slug", async () => {
    const { generateMetadata } = await import("@/app/resources/[slug]/page");
    const meta = await generateMetadata({
      params: Promise.resolve({ slug: "does-not-exist" }),
    });
    expectOwnCard(meta);
    expect(meta.title).toBe(`Resource not found — ${SITE_NAME}`);
  });
});

describe("/signatories/[id] metadata", () => {
  it("carries its own share card, with the OG image, for a real signer", async () => {
    getSignerById.mockResolvedValue({ id: "abc", displayName: "Ada Lovelace" });

    const { generateMetadata } = await import("@/app/signatories/[id]/page");
    const meta = await generateMetadata({ params: Promise.resolve({ id: "abc" }) });

    expectOwnCard(meta);
    // The title names the site in prose, so the helper must not also append it.
    expect(meta.title).toBe(`Ada Lovelace signed ${SITE_NAME}`);
    const og = meta.openGraph as Og;
    expect(og.type).toBe("profile");
    // This is the route whose OG image is why metadataBase has to resolve.
    expect(og.images).toEqual([
      { url: "/api/og/signer/abc", width: 1200, height: 630 },
    ]);
    expect((meta.twitter as Tw).card).toBe("summary_large_image");
  });

  it("carries its own share card when the signer is missing", async () => {
    getSignerById.mockResolvedValue(null);

    const { generateMetadata } = await import("@/app/signatories/[id]/page");
    const meta = await generateMetadata({ params: Promise.resolve({ id: "gone" }) });

    expectOwnCard(meta);
    expect(meta.title).toBe(`Signer not found — ${SITE_NAME}`);
    expect((meta.openGraph as Og).images).toBeUndefined();
  });
});
