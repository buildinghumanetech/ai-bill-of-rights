import { describe, expect, it } from "vitest";
import {
  FALLBACK_CATEGORY,
  PILL_CATEGORIES,
  US_LAW_SLUGS,
  articles,
  categoryMatches,
  pillCategory,
  pillColor,
} from "@/app/HomepageArticles";

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

  it("has no slug claimed by two category rules", () => {
    // `pillCategory` takes the first match, so an ambiguous slug is silently
    // resolved by array order rather than failing. That is a real hazard here:
    // `us-law` is a hand-maintained slug set while its neighbours are prefix
    // rules, so adding e.g. "uk-online-safety-act" to US_LAW_SLUGS would make
    // it match two rules and take whichever sits higher.
    //
    // Checked over the *rule set*, not just the slugs that currently render.
    // Registering a slug in a category's list before wiring it into an
    // article's `connects` is the natural order when preparing a resource
    // page, and iterating `allSlugs` alone would let that pass clean,
    // surfacing later as a mis-coloured pill.
    //
    // The iteration domain is derived from `PillCategory.slugs`, which the
    // type makes mandatory for any list-based rule — so a *new* category with
    // its own list is covered here without anyone widening this test. The
    // assertion below pins that derivation against the one list we know about
    // today, so dropping `slugs` from the us-law entry fails rather than
    // quietly shrinking the domain.
    // Prefixes are probed too, not just slug lists. A prefix string is a valid
    // probe for its own category, and `p.startsWith(q)` catches nesting in one
    // direction while probing `q` catches the other — so adding
    // `{ prefixes: ["uk-ai"] }` alongside `uk-regulation`'s `["uk-"]` fails
    // here even before any article links to such a slug. Without this the
    // hazard described above survived in prefix form, which is three of the
    // four specific categories.
    const enumerable = PILL_CATEGORIES.flatMap((c) => [
      ...(c.slugs ?? []),
      ...(c.prefixes ?? []),
    ]);
    expect(enumerable).toEqual(expect.arrayContaining([...US_LAW_SLUGS]));

    // The catch-all is excluded by identity — matching everything is its job.
    const specific = PILL_CATEGORIES.filter((c) => c !== FALLBACK_CATEGORY);
    for (const slug of new Set([...allSlugs, ...enumerable])) {
      const claimants = specific
        .filter((c) => categoryMatches(c, slug))
        .map((c) => c.id);
      expect(claimants.length, `${slug} claimed by ${claimants.join(" and ")}`).toBeLessThan(2);
    }
  });

  it("never returns an empty class string", () => {
    for (const slug of [...allSlugs, "a-slug-nobody-has-classified-yet"]) {
      expect(pillColor(slug)).toMatch(/^border-\w+-200 bg-\w+-50 /);
    }
  });
});
