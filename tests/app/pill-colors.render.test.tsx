import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { HomepageArticles, articles, pillColor } from "@/app/HomepageArticles";

/**
 * The Proposed tab (`mode="interactive"`) used to force every "Connects to"
 * pill to zinc grayscale, so the two tabs showed the same document in two
 * different palettes. These tests hold them identical.
 */

const render = (mode: "static" | "interactive") =>
  renderToStaticMarkup(<HomepageArticles mode={mode} />);

/**
 * Class list of every pill link, in document order.
 *
 * Attribute order is deliberately NOT assumed: it comes from `next/link`'s
 * internal prop spread (which emits `class` before `href`, the reverse of the
 * JSX), so a Next minor bump can flip it. Matching the whole `<a …>` and
 * pulling each attribute out separately means a flip cannot silently reduce
 * this to `[]` and leave the assertions below passing over an empty array.
 */
const pillClasses = (html: string) =>
  [...html.matchAll(/<a\b([^>]*)>/g)]
    .map((m) => m[1])
    .map((attrs) => ({
      slug: /href="\/resources\/([^"]+)"/.exec(attrs)?.[1],
      className: /class="([^"]*)"/.exec(attrs)?.[1] ?? "",
    }))
    .filter((p): p is { slug: string; className: string } => p.slug !== undefined);

describe("Connects-to pills across both tabs", () => {
  const staticPills = pillClasses(render("static"));
  const interactivePills = pillClasses(render("interactive"));

  it("renders the same pills in the same order in both modes", () => {
    expect(staticPills.length).toBeGreaterThan(20);
    expect(interactivePills.map((p) => p.slug)).toEqual(
      staticPills.map((p) => p.slug),
    );
  });

  it("gives the Proposed tab the same colours as the Current tab", () => {
    expect(interactivePills).toEqual(staticPills);
  });

  it("no longer renders any pill as zinc grayscale", () => {
    for (const pill of [...staticPills, ...interactivePills]) {
      expect(pill.className).not.toContain("bg-zinc-50");
      expect(pill.className).not.toContain("text-zinc-700");
    }
  });

  it("colours each pill by its category in the rendered markup", () => {
    for (const pill of interactivePills) {
      expect(pill.className).toContain(pillColor(pill.slug));
    }
  });

  it("renders every HumaneBench pill light blue on both tabs", () => {
    const humanebench = [...staticPills, ...interactivePills].filter((p) =>
      p.slug.startsWith("humanebench"),
    );
    expect(humanebench.length).toBeGreaterThan(0);
    for (const pill of humanebench) {
      expect(pill.className).toContain("bg-sky-50");
    }
  });

  it("keeps a repeated principle the same colour everywhere it appears", () => {
    // "Protect Dignity and Safety" is on Articles 01, 07 and 11 — the case the
    // old hash got right by accident and the case a category scheme must get
    // right on purpose.
    const slug = "humanebench-principle-protect-dignity-and-safety";
    const appearances = staticPills.filter((p) => p.slug === slug);
    expect(appearances.length).toBeGreaterThanOrEqual(3);
    expect(new Set(appearances.map((p) => p.className)).size).toBe(1);
  });

  it("still links every pill to its resource page", () => {
    const html = render("static");
    const slugs = new Set(
      articles.flatMap((a) => (a.connects ?? []).map((p) => p.slug)),
    );
    for (const slug of slugs) {
      expect(html).toContain(`href="/resources/${slug}"`);
    }
  });
});
