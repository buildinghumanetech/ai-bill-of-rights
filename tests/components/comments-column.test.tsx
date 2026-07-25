// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { act } from "react";

// The composer pulls in Clerk, the router and a server action; none of that is
// relevant to the scroll behaviour under test. Stub it with a fixed-size box so
// the only interesting variable is where that box sits in the viewport.
vi.mock("@/components/NewCommentForm", () => ({
  NewCommentForm: ({ selectedText }: { selectedText: string }) => (
    <div data-testid="composer">{selectedText}</div>
  ),
}));
vi.mock("@/components/CommentView", () => ({
  CommentView: () => <div data-testid="comment-view" />,
}));

import { CommentsColumn } from "@/components/CommentsColumn";
import { COMPOSER_CLOSED_EVENT, SELECTION_EVENT } from "@/lib/comments/selection";

const VIEWPORT_HEIGHT = 800;
const COMPOSER_HEIGHT = 200;

/**
 * Place the composer's box at `top`, so the component measures a realistic
 * rect. jsdom reports every rect as all-zero otherwise.
 */
function placeComposerAt(top: number) {
  Element.prototype.getBoundingClientRect = function (this: Element) {
    if ((this as HTMLElement).dataset?.testid !== "composer" && !this.querySelector?.("[data-testid='composer']")) {
      return { top: 0, bottom: 0, height: 0 } as DOMRect;
    }
    return { top, bottom: top + COMPOSER_HEIGHT, height: COMPOSER_HEIGHT } as DOMRect;
  };
}

function renderColumn() {
  return render(
    <CommentsColumn
      baseVersionId="v1"
      threadedComments={[]}
      activeCommentId={null}
      viewerSignerId="s1"
      isAdmin={false}
      signersForAdmin={[]}
      signersForMention={[]}
      onActiveChange={() => {}}
    />,
  );
}

function selectText(anchorId: string, selectedText: string) {
  act(() => {
    window.dispatchEvent(
      new CustomEvent(SELECTION_EVENT, { detail: { anchorId, selectedText } }),
    );
  });
}

describe("<CommentsColumn> composer auto-scroll", () => {
  let scrollIntoView: ReturnType<typeof vi.fn>;
  const realRect = Element.prototype.getBoundingClientRect;

  beforeEach(() => {
    scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    window.innerHeight = VIEWPORT_HEIGHT;
  });

  afterEach(() => {
    Element.prototype.getBoundingClientRect = realRect;
    cleanup();
  });

  it("scrolls when the composer opens below the fold", () => {
    // The narrow-viewport case the feature exists for: the column is stacked
    // under the whole document, so nothing appears to happen without this.
    placeComposerAt(VIEWPORT_HEIGHT + 400);
    renderColumn();
    selectText("a-1", "Opt-out is not consent.");
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("does not scroll when the composer is already fully visible", () => {
    placeComposerAt(100);
    renderColumn();
    selectText("a-1", "Opt-out is not consent.");
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("scrolls when only a sliver of the composer is on screen", () => {
    // Regression guard. Measuring the *column's* top edge and treating any
    // pixel in view as "visible" left the composer itself below the fold.
    placeComposerAt(VIEWPORT_HEIGHT - 20);
    renderColumn();
    selectText("a-1", "Opt-out is not consent.");
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("does not re-scroll while an open composer's selection is adjusted", () => {
    // An iOS selection-handle drag re-emits repeatedly; scrolling on each would
    // yank the sentence out from under the finger adjusting it. Once the first
    // scroll has happened the composer is visible, which is what suppresses it.
    placeComposerAt(VIEWPORT_HEIGHT + 400);
    renderColumn();
    selectText("a-1", "Opt-out");
    expect(scrollIntoView).toHaveBeenCalledTimes(1);

    placeComposerAt(200); // the scroll brought it into view
    selectText("a-1", "Opt-out is");
    selectText("a-1", "Opt-out is not");
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("scrolls again for a new phrase in the SAME sentence once out of view", () => {
    // Regression guard. Keying suppression on the anchor id made this stick
    // forever: anchors are sentence-level, so re-selecting within one sentence
    // kept matching, and the composer the user would have to dismiss to reset
    // it was the thing they couldn't see.
    placeComposerAt(VIEWPORT_HEIGHT + 400);
    renderColumn();
    selectText("a-1", "Opt-out");
    expect(scrollIntoView).toHaveBeenCalledTimes(1);

    // User scrolls back up to the article; the composer is off-screen again.
    placeComposerAt(VIEWPORT_HEIGHT + 400);
    selectText("a-1", "Buried checkboxes");
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
  });
});

describe("<CommentsColumn> composer dismissal", () => {
  const realRect = Element.prototype.getBoundingClientRect;

  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    window.innerHeight = VIEWPORT_HEIGHT;
    placeComposerAt(100);
  });

  afterEach(() => {
    Element.prototype.getBoundingClientRect = realRect;
    cleanup();
  });

  it("announces closure so the container clears its dedupe guard", () => {
    // Without this the same phrase can never be re-selected — the sticky-guard
    // bug, reached via the click/Enter-a-highlight path.
    const closed = vi.fn();
    window.addEventListener(COMPOSER_CLOSED_EVENT, closed);

    const { rerender, queryByTestId } = renderColumn();
    selectText("a-1", "Opt-out is not consent.");
    expect(queryByTestId("composer")).not.toBeNull();

    act(() => {
      rerender(
        <CommentsColumn
          baseVersionId="v1"
          threadedComments={[]}
          activeCommentId="c-1"
          viewerSignerId="s1"
          isAdmin={false}
          signersForAdmin={[]}
          signersForMention={[]}
          onActiveChange={() => {}}
        />,
      );
    });

    expect(closed).toHaveBeenCalledTimes(1);
    expect(queryByTestId("composer")).toBeNull();
    window.removeEventListener(COMPOSER_CLOSED_EVENT, closed);
  });

  it("does not announce closure when no composer was open", () => {
    const closed = vi.fn();
    window.addEventListener(COMPOSER_CLOSED_EVENT, closed);

    render(
      <CommentsColumn
        baseVersionId="v1"
        threadedComments={[]}
        activeCommentId="c-1"
        viewerSignerId="s1"
        isAdmin={false}
        signersForAdmin={[]}
        signersForMention={[]}
        onActiveChange={() => {}}
      />,
    );

    expect(closed).not.toHaveBeenCalled();
    window.removeEventListener(COMPOSER_CLOSED_EVENT, closed);
  });
});
