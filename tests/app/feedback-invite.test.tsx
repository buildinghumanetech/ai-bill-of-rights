import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { FeedbackInvite } from "@/components/FeedbackInvite";

/**
 * The banner above the document tabs. Two things this suite exists to hold:
 * the copy stays free of em dashes (they read as noise at this size), and the
 * Current variant stays centered while the Proposed variant — whose numbered
 * step grid depends on left alignment — does not.
 */

const render = (el: ReactElement) => renderToStaticMarkup(el);
/** Strip tags so assertions match copy the visitor actually reads. */
const text = (el: ReactElement) =>
  render(el)
    .replace(/<[^>]*>/g, "")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&");

const current = (commentCount: number) => (
  <FeedbackInvite
    variant="current"
    currentVersion="1.0"
    proposedVersion="1.1"
    commentCount={commentCount}
    onOpenDraft={() => {}}
  />
);

const proposed = (commentCount: number) => (
  <FeedbackInvite variant="proposed" proposedVersion="1.1" commentCount={commentCount} />
);

/**
 * Class *tokens* of the single classed `<tag>` in `html`, optionally narrowed
 * to the one carrying `discriminator`.
 *
 * Returns an array rather than the raw string so every `toContain` at a call
 * site is exact membership. Against the string, `toContain("text-center")` is
 * satisfied by `sm:text-center` and `toContain("mt-2")` by `mt-20` — a banner
 * centered on desktop but broken on mobile would pass.
 *
 * The same change cuts the other way for *negative* assertions: membership
 * makes `not.toContain("text-center")` blind to `sm:text-center`, which would
 * let a variant slip past a guard meant to exclude the class entirely. So
 * negatives run their tokens through `baseClasses` first, which reduces
 * `sm:hover:bg-blue-600/90` to `bg-blue-600` and leaves `not.toContain` a real
 * matcher.
 *
 * Class assertions are scoped to the element under test: a bare
 * `html.toContain("text-center")` would fire on any nested element picking up
 * the class, which is a different change than the one being guarded.
 *
 * Throws unless exactly one candidate matches, so a rename fails the test
 * rather than silently retargeting it. Two escape hatches are deliberate and
 * worth knowing: an element with no `class` attribute at all is invisible here,
 * and when a `discriminator` is given the uniqueness check covers only elements
 * carrying it — a new classed sibling *without* it passes unnoticed.
 */
const classesOf = (html: string, tag: string, discriminator?: string) => {
  // `(?=[\s>])` delimits the tag name: without it, "p" matches <path>, <pre>
  // and <param>, and a wrong element's class list satisfies the assertion.
  const pattern = new RegExp(`<${tag}(?=[\\s>])[^>]*\\sclass="([^"]*)"`, "g");
  const classLists = [...html.matchAll(pattern)]
    .map((m) => m[1].split(/\s+/).filter(Boolean))
    // Exact token match, not substring: `includes("max-w-3xl")` over the raw
    // string would also accept `sm:max-w-3xl`, reintroducing one layer down the
    // imprecision the `(?=[\s>])` lookahead above exists to prevent.
    .filter((tokens) =>
      discriminator === undefined ? true : tokens.includes(discriminator),
    );

  // Uniqueness, not first-match: the pattern skips unclassed tags and advances,
  // so without this a classed sibling still matches and quietly shifts the target.
  if (classLists.length !== 1) {
    const which = discriminator === undefined ? "" : ` carrying "${discriminator}"`;
    throw new Error(
      `expected exactly one classed <${tag}>${which}, found ${classLists.length}`,
    );
  }
  return classLists[0];
};

/**
 * Class tokens reduced to their base utility: `sm:hover:bg-blue-600/90` becomes
 * `bg-blue-600`.
 *
 * Negative assertions go through this. Plain `not.toContain` over raw tokens is
 * exact membership, so it would let `sm:text-center` past a guard whose whole
 * job is to exclude `text-center` — the wrong direction entirely. Normalizing
 * the tokens rather than wrapping the check in a boolean keeps the matcher's
 * diff, so a failure names the class list instead of printing
 * `expected false to be true`.
 *
 * Reach: *all* variant prefixes — not just responsive, but interaction states
 * and `dark:` too — plus opacity modifiers. Two limits worth knowing, and they
 * fail differently:
 *
 * - Out of scope, simply not caught: a different shade (`bg-blue-500`) or an
 *   arbitrary value (`bg-[#2563eb]`).
 * - Actively mangled: the split on `:` is unconditional, so a token with a
 *   colon inside brackets — `[&:hover]:bg-blue-600`, `bg-[url(data:…)]` —
 *   reduces to a fragment rather than a utility and quietly disarms the guard
 *   for the very class it was aimed at. This assumes plain
 *   `variant:utility/opacity` tokens.
 */
const baseClasses = (tokens: string[]) =>
  tokens.map((token) => token.split(":").pop()!.split("/")[0]);

describe("FeedbackInvite (current)", () => {
  it("uses no em dashes", () => {
    expect(text(current(0))).not.toContain("—");
    expect(text(current(12))).not.toContain("—");
  });

  // Run over both counts on purpose: the claim is that centering does *not*
  // depend on the count. The populated render adds a second classed <p>, and
  // that is the state the banner is normally in, so it must not be the state
  // that goes unchecked. The count line's own styling is asserted below, in the
  // test named for it — putting it here would fail a centering test for a
  // palette tweak.
  it.each([0, 12])("centers the whole box, paragraph included (count %i)", (count) => {
    const html = render(current(count));
    expect(classesOf(html, "section")).toContain("text-center");
    // A width-capped paragraph stays pinned to the left edge of a centered
    // box unless it is also horizontally centered.
    expect(classesOf(html, "p", "max-w-3xl")).toContain("mx-auto");
  });

  it("states the mechanism in two sentences", () => {
    const copy = text(current(0));
    expect(copy).toContain("This is a living document. You can change it.");
    expect(copy).toContain("You're reading v1.0, the version people are signing.");
    expect(copy).toContain("highlight any line to comment or suggest wording");
    // The long version's extra beats are gone.
    expect(copy).not.toContain("voted up or down");
    expect(copy).not.toContain("walk away");
  });

  it("offers the draft as a text link, not a button-styled control", () => {
    const html = render(current(0));
    expect(text(current(0))).toContain("Mark up the v1.1 draft");

    const button = classesOf(html, "button");
    expect(button).toContain("underline");
    // The old filled pill button is gone: no fill, no pill, under *any* variant.
    // `baseClasses` collapses interaction states too, so `hover:bg-blue-600`
    // trips this as surely as `sm:bg-blue-600` does. That is deliberate — on a
    // control styled as a text link, a hover fill is the pill coming back — but
    // it means a genuine hover affordance has to be built without that class,
    // not that the guard is misfiring.
    expect(baseClasses(button)).not.toContain("bg-blue-600");
    expect(baseClasses(button)).not.toContain("rounded-full");

    expect(text(current(0))).not.toContain("Give feedback on");
  });

  it("mentions the comment count only when there is one", () => {
    const empty = text(current(0));
    expect(empty).not.toContain("already");
    // The old empty state is gone entirely.
    expect(empty).not.toContain("No comments yet");

    expect(text(current(12))).toContain("12 comments already on it.");
    expect(text(current(1))).toContain("1 comment already on it.");

    // The count line is supporting copy under the link, not a second control:
    // muted and tight to it. Its centering is inherited from the section and is
    // guarded by the `it.each([0, 12])` centering test above, which runs on this
    // same populated markup — asserting it here again would only duplicate that.
    expect(classesOf(render(current(12)), "p", "text-zinc-600")).toContain("mt-2");
  });
});

describe("FeedbackInvite (proposed)", () => {
  it("uses no em dashes", () => {
    expect(text(proposed(0))).not.toContain("—");
    expect(text(proposed(12))).not.toContain("—");
  });

  it("keeps its heading and step list intact and left-aligned", () => {
    const html = render(proposed(12));
    expect(text(proposed(12))).toContain(
      "You're in the draft. This is where feedback happens.",
    );
    expect(text(proposed(12))).toContain("Select any text");
    expect(text(proposed(12))).toContain("Drag across a sentence. On a phone, press and hold.");
    expect(html).toContain("sm:grid-cols-3");
    // This is the suite's only guard that the step grid stays left-aligned, so
    // it has to fail on a structural change rather than quietly stop guarding.
    // `classesOf` throwing on anything but a unique match is what supplies that;
    // a decorative positive assertion here would only add a false-failure surface.
    // Through `baseClasses`, not raw tokens, so this excludes `text-center`
    // under any variant — see its header for the reach. The responsive case
    // (`sm:text-center`, centering the grid on desktop only) is the regression
    // it was written for, not the only one it catches.
    expect(baseClasses(classesOf(html, "section"))).not.toContain("text-center");
  });
});
