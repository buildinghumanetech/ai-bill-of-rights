// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { act } from "react";

// The composer pulls in Clerk, the router and a server action; none of that is
// relevant here. The stub exposes the two dismissal callbacks as buttons so the
// close paths are actually reachable from a test.
vi.mock("@/components/NewCommentForm", () => ({
  NewCommentForm: ({
    selectedText,
    onCancel,
    onSubmittedNewTopLevel,
  }: {
    selectedText: string;
    onCancel: () => void;
    onSubmittedNewTopLevel?: (id: string) => void;
  }) => (
    <div data-testid="composer">
      {selectedText}
      <button data-testid="cancel" onClick={onCancel} />
      <button data-testid="submit" onClick={() => onSubmittedNewTopLevel?.("new-1")} />
    </div>
  ),
}));
vi.mock("@/components/CommentView", () => ({
  CommentView: () => <div data-testid="comment-view" />,
}));

import { CommentsColumn } from "@/components/CommentsColumn";
import { COMPOSER_CLOSED_EVENT, SELECTION_EVENT } from "@/lib/comments/selection";

const VIEWPORT_HEIGHT = 800;
const COMPOSER_HEIGHT = 200;
/** How far above the composer its column starts (heading + padding). */
const COLUMN_LEAD = 50;

const realRect = Element.prototype.getBoundingClientRect;
const realScroll = Element.prototype.scrollIntoView;

/**
 * Place the composer's box at `top`, mirroring the real layout's geometry.
 *
 * The distinction that matters: the `composerRef` wrapper hugs the composer, so
 * it gets the *composer's* box. Only the column starts COLUMN_LEAD higher.
 * Giving every ancestor the lead, wrapper included, is what silently made the
 * geometry tests measure column-shaped rects and left "measure the composer, not
 * the column" unfalsifiable on geometry alone.
 *
 * Column and wrapper are told apart by an explicit testid. Keying it on the
 * presence of an `<h3>` worked, but coupled both guards to a heading level in
 * unrelated markup: an `h3` -> `h2` a11y fix would have made the column report
 * composer geometry and quietly disarmed them.
 *
 * The `height` argument is what sets `bottom`, and `bottom - top` is the only
 * thing either rule measures — `ScrollDecisionInput` doesn't even declare a
 * `height` field. The `height` key on these fakes is there for DOMRect
 * faithfulness and is read by nothing, so keep it consistent with `bottom` and
 * don't be tempted to use it *instead* of `bottom`.
 */
function placeComposerAt(top: number, height: number = COMPOSER_HEIGHT) {
  const composerRect = { top, bottom: top + height, height } as DOMRect;
  const columnRect = {
    top: top - COLUMN_LEAD,
    bottom: top + height,
    height: height + COLUMN_LEAD,
  } as DOMRect;

  Element.prototype.getBoundingClientRect = function (this: Element) {
    const el = this as HTMLElement;
    if (el.dataset?.testid === "composer") return composerRect;
    if (el.dataset?.testid === "comments-column") return columnRect;
    return el.querySelector?.("[data-testid='composer']")
      ? composerRect // the composerRef wrapper
      : ({ top: 0, bottom: 0, height: 0 } as DOMRect);
  };
}

function columnProps(activeCommentId: string | null = null) {
  return {
    baseVersionId: "v1",
    threadedComments: [],
    activeCommentId,
    viewerSignerId: "s1",
    isAdmin: false,
    signersForAdmin: [],
    signersForMention: [],
    onActiveChange: () => {},
  };
}

function selectText(anchorId: string, selectedText: string) {
  act(() => {
    window.dispatchEvent(
      new CustomEvent(SELECTION_EVENT, { detail: { anchorId, selectedText } }),
    );
  });
}

describe("<CommentsColumn> composer auto-scroll", () => {
  /** Elements scrollIntoView was called on, so we can assert *which* one. */
  let scrolled: Element[];
  /** The options it was called with, so we can assert the alignment. */
  let scrollOpts: ScrollIntoViewOptions[];

  beforeEach(() => {
    scrolled = [];
    scrollOpts = [];
    Element.prototype.scrollIntoView = function (this: Element, arg?: unknown) {
      scrolled.push(this);
      scrollOpts.push((arg ?? {}) as ScrollIntoViewOptions);
    };
    window.innerHeight = VIEWPORT_HEIGHT;
  });

  afterEach(() => {
    Element.prototype.getBoundingClientRect = realRect;
    Element.prototype.scrollIntoView = realScroll;
    cleanup();
  });

  it("scrolls when the composer opens below the fold", () => {
    // The narrow-viewport case the feature exists for: the column is stacked
    // under the whole document, so nothing appears to happen without this.
    placeComposerAt(VIEWPORT_HEIGHT + 400);
    render(<CommentsColumn {...columnProps()} />);
    selectText("a-1", "Opt-out is not consent.");
    expect(scrolled).toHaveLength(1);
  });

  it("scrolls the element wrapping the composer, not the whole column", () => {
    // Regression guard for the central fix: measuring the column let its top
    // edge sit inside the viewport while the composer was below the fold.
    placeComposerAt(VIEWPORT_HEIGHT + 400);
    const { getByTestId } = render(<CommentsColumn {...columnProps()} />);
    selectText("a-1", "Opt-out is not consent.");

    const composer = getByTestId("composer");
    expect(scrolled).toHaveLength(1);
    // The wrapper that hugs the composer — not the column above it. Asserted as
    // an identity rather than "has no <h3> inside", which a heading-level change
    // could have satisfied trivially.
    expect(scrolled[0]).toBe(composer.parentElement);
    expect(scrolled[0]).not.toBe(getByTestId("comments-column"));
  });

  it("decides on the composer's geometry even where the column's disagrees", () => {
    // The one case that makes "measure the composer, not the column" fail on
    // geometry alone rather than on the structural h3 check below. The two
    // rules only diverge in a narrow band, so the numbers are load-bearing:
    //   composer  90 of 200 visible = 0.45  -> under the threshold, scroll
    //   column   140 of 250 visible = 0.56  -> over it, would hold still
    // Measure the wrong element and this test goes quiet.
    placeComposerAt(VIEWPORT_HEIGHT - 90);
    render(<CommentsColumn {...columnProps()} />);
    selectText("a-1", "Opt-out is not consent.");
    expect(scrolled).toHaveLength(1);
  });

  it("aligns a composer that fits to the centre", () => {
    placeComposerAt(VIEWPORT_HEIGHT + 400);
    render(<CommentsColumn {...columnProps()} />);
    selectText("a-1", "Opt-out is not consent.");
    expect(scrollOpts[0].block).toBe("center");
  });

  it("aligns a composer taller than the viewport to its top", () => {
    // Centering something taller than the screen puts its middle on screen —
    // which means the quote block and the top of the textarea sit above the
    // fold. Worse, the visibility rule then measures a full viewport of
    // composer, calls it visible, and never corrects it, parking the user at
    // the bottom of a box they need to type into the top of.
    placeComposerAt(VIEWPORT_HEIGHT + 400, VIEWPORT_HEIGHT + 400);
    render(<CommentsColumn {...columnProps()} />);
    selectText("a-1", "Opt-out is not consent.");
    expect(scrolled).toHaveLength(1);
    expect(scrollOpts[0].block).toBe("start");
  });

  it("chooses the alignment from the composer's height, not the column's", () => {
    // The alignment wiring needs its own discriminating case: the column is only
    // COLUMN_LEAD taller, so for most heights both fit or both overflow and
    // pointing composerScrollBlock at the column would go unnoticed. Here the
    // composer is 780 (fits in 800 -> "center") while the column is 830
    // (doesn't -> "start"), so the two genuinely disagree.
    placeComposerAt(VIEWPORT_HEIGHT + 400, VIEWPORT_HEIGHT - 20);
    render(<CommentsColumn {...columnProps()} />);
    selectText("a-1", "Opt-out is not consent.");
    expect(scrolled).toHaveLength(1);
    expect(scrollOpts[0].block).toBe("center");
  });

  it("does not scroll when the composer is already fully visible", () => {
    placeComposerAt(100);
    render(<CommentsColumn {...columnProps()} />);
    selectText("a-1", "Opt-out is not consent.");
    expect(scrolled).toHaveLength(0);
  });

  it("scrolls when only a sliver of the composer is on screen", () => {
    // Regression guard. Measuring the column's top edge and treating any pixel
    // in view as "visible" left the composer itself below the fold — with
    // COLUMN_LEAD applied, the column here still reports a visible top edge.
    placeComposerAt(VIEWPORT_HEIGHT - 20);
    render(<CommentsColumn {...columnProps()} />);
    selectText("a-1", "Opt-out is not consent.");
    expect(scrolled).toHaveLength(1);
  });

  it("does not re-scroll once the composer has been brought into view", () => {
    // An iOS selection-handle drag re-emits repeatedly. Once a scroll has
    // landed, visibility alone suppresses the rest — which is why the old
    // anchor gate was redundant.
    placeComposerAt(VIEWPORT_HEIGHT + 400);
    render(<CommentsColumn {...columnProps()} />);
    selectText("a-1", "Opt-out");
    expect(scrolled).toHaveLength(1);

    placeComposerAt(200); // the scroll landed
    selectText("a-1", "Opt-out is");
    selectText("a-1", "Opt-out is not");
    expect(scrolled).toHaveLength(1);
  });

  it("re-issues the scroll if a second emit lands mid-animation", () => {
    // Honest about the real timing: `behavior: "smooth"` outlasts the 350ms
    // selection debounce, so a second emit can still measure the composer
    // off-screen. Benign — same element, same block, so the animation just
    // continues toward the same place — but pinned so it stays deliberate.
    placeComposerAt(VIEWPORT_HEIGHT + 400);
    render(<CommentsColumn {...columnProps()} />);
    selectText("a-1", "Opt-out");
    selectText("a-1", "Opt-out is");

    expect(scrolled).toHaveLength(2);
    expect(scrolled[0]).toBe(scrolled[1]);
  });

  it("scrolls again for a new phrase in the SAME sentence once out of view", () => {
    // Regression guard. Keying suppression on the anchor id made this stick
    // forever: anchors are sentence-level, so re-selecting within one sentence
    // kept matching, and the composer the user would have to dismiss to reset
    // it was the thing they couldn't see.
    placeComposerAt(VIEWPORT_HEIGHT + 400);
    render(<CommentsColumn {...columnProps()} />);
    selectText("a-1", "Opt-out");
    expect(scrolled).toHaveLength(1);

    placeComposerAt(200); // scroll landed, composer visible
    selectText("a-1", "Opt-out is");
    expect(scrolled).toHaveLength(1);

    placeComposerAt(VIEWPORT_HEIGHT + 400); // user scrolled back up to the article
    selectText("a-1", "Buried checkboxes");
    expect(scrolled).toHaveLength(2);
  });

  it("also scrolls on a desktop-shaped layout when the composer is cut off", () => {
    // The visibility rule intentionally applies at every width, not just below
    // md. Pinned because it is a behaviour change from the old breakpoint gate.
    window.innerHeight = 500;
    placeComposerAt(430); // column starts at 380, well in view; composer is not
    render(<CommentsColumn {...columnProps()} />);
    selectText("a-1", "Opt-out is not consent.");
    expect(scrolled).toHaveLength(1);
  });
});

describe("<CommentsColumn> composer dismissal", () => {
  let closed: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    Element.prototype.scrollIntoView = function () {};
    window.innerHeight = VIEWPORT_HEIGHT;
    placeComposerAt(100); // visible, so no scrolling noise
    closed = vi.fn();
    window.addEventListener(COMPOSER_CLOSED_EVENT, closed);
  });

  afterEach(() => {
    window.removeEventListener(COMPOSER_CLOSED_EVENT, closed);
    Element.prototype.getBoundingClientRect = realRect;
    Element.prototype.scrollIntoView = realScroll;
    cleanup();
  });

  it("announces closure when the composer is cancelled", () => {
    const { getByTestId, queryByTestId } = render(<CommentsColumn {...columnProps()} />);
    selectText("a-1", "Opt-out is not consent.");

    act(() => {
      fireEvent.click(getByTestId("cancel"));
    });

    expect(closed).toHaveBeenCalledTimes(1);
    expect(queryByTestId("composer")).toBeNull();
  });

  it("announces closure exactly once when a comment is submitted", () => {
    // onSubmittedNewTopLevel closes the composer and then activates the new
    // comment. Without the pendingSelection guard on the activeCommentId
    // effect, that second step fires a duplicate close.
    const { getByTestId, rerender } = render(<CommentsColumn {...columnProps()} />);
    selectText("a-1", "Opt-out is not consent.");

    act(() => {
      fireEvent.click(getByTestId("submit"));
    });
    act(() => {
      rerender(<CommentsColumn {...columnProps("new-1")} />);
    });

    expect(closed).toHaveBeenCalledTimes(1);
  });

  it("announces closure when a saved highlight is activated", () => {
    // The click/Enter-a-highlight path. Clearing state without announcing it
    // left the container's dedupe guard stale for keyboard users.
    const { rerender, queryByTestId } = render(<CommentsColumn {...columnProps()} />);
    selectText("a-1", "Opt-out is not consent.");
    expect(queryByTestId("composer")).not.toBeNull();

    act(() => {
      rerender(<CommentsColumn {...columnProps("c-1")} />);
    });

    expect(closed).toHaveBeenCalledTimes(1);
    expect(queryByTestId("composer")).toBeNull();
  });

  it("stays quiet when no composer was open", () => {
    render(<CommentsColumn {...columnProps("c-1")} />);
    expect(closed).not.toHaveBeenCalled();
  });
});
