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
 * Class assertions are scoped to the element under test. A bare
 * `html.toContain("text-center")` would fire on any nested element picking up
 * the class, which is a different change than the one being guarded.
 */
const classesOf = (html: string, tag: string) => {
  // `(?=[\s>])` delimits the tag name: without it, "p" matches <path>, <pre>
  // and <param>, and a wrong element's class list satisfies the assertion.
  const match = new RegExp(`<${tag}(?=[\\s>])[^>]*\\sclass="([^"]*)"`).exec(html);
  if (match === null) throw new Error(`no <${tag}> with a class attribute in markup`);
  return match[1];
};

describe("FeedbackInvite (current)", () => {
  it("uses no em dashes", () => {
    expect(text(current(0))).not.toContain("—");
    expect(text(current(12))).not.toContain("—");
  });

  it("centers the whole box, paragraph included", () => {
    const html = render(current(0));
    expect(classesOf(html, "section")).toContain("text-center");
    // A width-capped paragraph stays pinned to the left edge of a centered box
    // unless it is also horizontally centered.
    const paragraph = classesOf(html, "p");
    expect(paragraph).toContain("max-w-3xl");
    expect(paragraph).toContain("mx-auto");
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
    // The old filled pill button is gone: no fill, no pill.
    expect(button).not.toContain("bg-blue-600");
    expect(button).not.toContain("rounded-full");

    expect(text(current(0))).not.toContain("Give feedback on");
  });

  it("mentions the comment count only when there is one", () => {
    const empty = text(current(0));
    expect(empty).not.toContain("already");
    // The old empty state is gone entirely.
    expect(empty).not.toContain("No comments yet");

    expect(text(current(12))).toContain("12 comments already on it.");
    expect(text(current(1))).toContain("1 comment already on it.");
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
    // Anchor the lookup before negating: this is the suite's only guard that
    // the step grid stays left-aligned, so it must fail on a structural
    // rename rather than quietly stop guarding.
    const section = classesOf(html, "section");
    expect(section).toContain("rounded-xl");
    expect(section).not.toContain("text-center");
  });
});
