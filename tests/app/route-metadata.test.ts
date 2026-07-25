import { describe, expect, it } from "vitest";
import { SITE_NAME, SITE_TITLE } from "@/lib/site-metadata";

/**
 * Guards the shallow-merge hazard at the route level.
 *
 * Next merges metadata shallowly, so a route that sets its own `title` but no
 * `openGraph` silently inherits the root's — and shares as if it were the
 * homepage. `buildPageMetadata()` exists to prevent that, but nothing stopped a
 * route from going back to a bare `{ title, description }` until these tests.
 */

type Og = { title?: string; description?: string; siteName?: string; type?: string };
type Tw = { title?: string; card?: string };

function expectOwnCard(meta: {
  title?: unknown;
  openGraph?: unknown;
  twitter?: unknown;
}) {
  const og = meta.openGraph as Og | undefined;
  const tw = meta.twitter as Tw | undefined;

  expect(og, "route defines no openGraph — it will inherit the homepage's").toBeDefined();
  expect(tw, "route defines no twitter block — it will inherit the homepage's").toBeDefined();

  // The card must describe this page, not the site.
  expect(og!.title).toBe(meta.title);
  expect(og!.title).not.toBe(SITE_TITLE);
  expect(tw!.title).toBe(meta.title);

  // ...while still keeping the fields a child block would otherwise drop.
  expect(og!.siteName).toBe(SITE_NAME);
  expect(og!.type).toBeDefined();
  expect(tw!.card).toBeDefined();
}

describe("/about metadata", () => {
  it("carries its own share card", async () => {
    const { metadata } = await import("@/app/about/page");
    expectOwnCard(metadata);
  });
});

describe("/resources/[slug] metadata", () => {
  it("carries its own share card for a real resource", async () => {
    const { generateMetadata } = await import("@/app/resources/[slug]/page");
    const meta = await generateMetadata({
      params: Promise.resolve({ slug: "coppa" }),
    });
    expectOwnCard(meta);
  });

  it("carries its own share card for an unknown slug", async () => {
    const { generateMetadata } = await import("@/app/resources/[slug]/page");
    const meta = await generateMetadata({
      params: Promise.resolve({ slug: "does-not-exist" }),
    });
    expectOwnCard(meta);
  });
});
