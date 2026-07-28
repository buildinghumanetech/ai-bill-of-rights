import { describe, expect, it } from "vitest";
import { articles, pillCategory, pillColor } from "@/app/HomepageArticles";

/**
 * "Connects to" pill colour is a property of the pill's category, not of the
 * individual pill. The rule this suite exists to hold: a reader who learns
 * "light blue means HumaneBench" should find that true everywhere, on both
 * tabs — the previous hash-of-slug scheme gave the six HumaneBench principles
 * five different colours.
 */

const allSlugs = [
  ...new Set(articles.flatMap((a) => (a.connects ?? []).map((p) => p.slug))),
].sort();

const slugsIn = (categoryId: string) =>
  allSlugs.filter((s) => pillCategory(s).id === categoryId);

describe("pill categories", () => {
  it("has pills to colour at all", () => {
    // Guards every other test in this file from passing vacuously if the
    // `connects` data ever moves out of this module.
    expect(allSlugs.length).toBeGreaterThan(20);
  });

  it("gives every HumaneBench pill the same colour", () => {
    const humanebench = slugsIn("humanebench");
    // Six principles plus "HumaneBench as measurement infrastructure", which
    // the user asked to read as one family with them.
    expect(humanebench.length).toBeGreaterThanOrEqual(7);
    expect(humanebench).toContain("humanebench-as-measurement-infrastructure");
    expect(
      humanebench.filter((s) => s.startsWith("humanebench-principle-")).length,
    ).toBeGreaterThanOrEqual(6);

    const colors = new Set(humanebench.map(pillColor));
    expect(colors.size).toBe(1);
    // Light blue, as specified.
    expect([...colors][0]).toContain("bg-sky-50");
  });

  it("lands every pill in a category deliberately", () => {
    // `research-advocacy` matches everything, so it doubles as the fallback.
    // Listing its members explicitly means a newly added slug that nobody
    // classified fails here instead of silently inheriting rose.
    expect(slugsIn("research-advocacy").sort()).toEqual(
      [
        "algorithmic-audit-proposals",
        "center-for-humane-technology-attention-rights",
        "childrens-rights-frameworks",
        "competitive-ai-market-concerns",
        "healthcare-ai-ethics-literature",
        "ieee-ai-children-working-group",
        "interoperability-advocacy",
      ].sort(),
    );
  });

  it("groups the regulatory families", () => {
    expect(slugsIn("eu-regulation").every((s) => /^(eu-ai-act|gdpr)/.test(s))).toBe(true);
    expect(slugsIn("eu-regulation").length).toBeGreaterThanOrEqual(8);

    expect(slugsIn("uk-regulation")).toEqual([
      "uk-age-appropriate-design-code",
      "uk-ai-safety-institute",
    ]);

    expect(slugsIn("us-law")).toContain("coppa");
    expect(slugsIn("us-law")).toContain("ftc-act-section-5");
    expect(slugsIn("us-law").length).toBeGreaterThanOrEqual(9);
  });

  it("gives each category a distinct colour", () => {
    const ids = [...new Set(allSlugs.map((s) => pillCategory(s).id))];
    const colors = new Set(ids.map((id) => pillColor(slugsIn(id)[0])));
    expect(colors.size).toBe(ids.length);
  });

  it("keeps a pill's colour stable across calls", () => {
    for (const slug of allSlugs) {
      expect(pillColor(slug)).toBe(pillColor(slug));
    }
  });

  it("never returns an empty class string", () => {
    for (const slug of [...allSlugs, "a-slug-nobody-has-classified-yet"]) {
      expect(pillColor(slug)).toMatch(/^border-\w+-200 bg-\w+-50 /);
    }
  });
});
