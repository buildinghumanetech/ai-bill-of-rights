import { describe, expect, it } from "vitest";
import {
  nextSelectionState,
  shouldScrollComposerIntoView,
  type AnchoredSelection,
} from "@/lib/comments/selection";

const sel = (anchorId: string, selectedText: string) => ({ anchorId, selectedText });

describe("nextSelectionState", () => {
  it("emits the first selection", () => {
    expect(nextSelectionState(null, sel("a-1", "belongs to you"))).toEqual({
      emit: true,
      last: sel("a-1", "belongs to you"),
    });
  });

  it("suppresses the duplicate that the second signal produces", () => {
    // mouseup fires, then the debounced selectionchange fires for the same
    // gesture — the composer must not be remounted out from under the user.
    const first = sel("a-1", "belongs to you");
    expect(nextSelectionState(first, first)).toEqual({ emit: false, last: first });
  });

  it("emits when the selected text changes within the same anchor", () => {
    const first = sel("a-1", "belongs to you");
    const next = sel("a-1", "belongs to you.");
    expect(nextSelectionState(first, next)).toEqual({ emit: true, last: next });
  });

  it("emits when the same text is selected in a different anchor", () => {
    const first = sel("a-1", "consent");
    const next = sel("a-2", "consent");
    expect(nextSelectionState(first, next)).toEqual({ emit: true, last: next });
  });

  describe("resets `last` so the guard can never go sticky", () => {
    const prior = sel("a-1", "consent");

    it("resets on a collapsed / unusable selection", () => {
      expect(nextSelectionState(prior, null)).toEqual({ emit: false, last: null });
    });

    it("resets on a whitespace-only selection", () => {
      expect(nextSelectionState(prior, sel("a-1", "   \n "))).toEqual({
        emit: false,
        last: null,
      });
    });

    it("re-emits identical text once the state has been reset", () => {
      // Regression guard. Previously the no-anchor and outside-root paths
      // returned early leaving `last` stale, so cancelling the composer and
      // re-selecting the very same phrase silently did nothing.
      const cleared = nextSelectionState(prior, null);
      expect(cleared.last).toBeNull();
      expect(nextSelectionState(cleared.last, prior)).toEqual({
        emit: true,
        last: prior,
      });
    });
  });

  it("survives a full cancel-and-reselect round trip", () => {
    // select → dedupe → cancel (container resets) → reselect the same phrase
    let last: AnchoredSelection | null = null;
    const phrase = sel("a-3", "Opt-out is not consent");

    let step = nextSelectionState(last, phrase);
    expect(step.emit).toBe(true);
    last = step.last;

    step = nextSelectionState(last, phrase); // second signal, same gesture
    expect(step.emit).toBe(false);
    last = step.last;

    last = null; // composer closed → forgetLastEmit()

    step = nextSelectionState(last, phrase);
    expect(step.emit).toBe(true);
  });
});

describe("shouldScrollComposerIntoView", () => {
  const VH = 800;
  /** Column stacked below the fold — the narrow-viewport case. */
  const offScreen = { top: 1400, bottom: 2000 };
  /** Column beside the article and visible — the desktop case. */
  const onScreen = { top: 120, bottom: 700 };

  it("scrolls for a new anchor when the column is off-screen", () => {
    expect(
      shouldScrollComposerIntoView({
        lastScrolledAnchorId: null,
        anchorId: "a-1",
        rect: offScreen,
        viewportHeight: VH,
      }),
    ).toBe(true);
  });

  it("does not scroll while the same anchor's selection is being adjusted", () => {
    // Dragging an iOS selection handle re-emits with the same anchor; scrolling
    // on each would yank the sentence out from under the finger.
    expect(
      shouldScrollComposerIntoView({
        lastScrolledAnchorId: "a-1",
        anchorId: "a-1",
        rect: offScreen,
        viewportHeight: VH,
      }),
    ).toBe(false);
  });

  it("scrolls again when the user picks a different sentence", () => {
    // Regression guard: gating on "composer already open" instead of on the
    // anchor left a second selection updating the composer off-screen.
    expect(
      shouldScrollComposerIntoView({
        lastScrolledAnchorId: "a-1",
        anchorId: "a-2",
        rect: offScreen,
        viewportHeight: VH,
      }),
    ).toBe(true);
  });

  it("does not scroll when the column is already visible", () => {
    expect(
      shouldScrollComposerIntoView({
        lastScrolledAnchorId: null,
        anchorId: "a-1",
        rect: onScreen,
        viewportHeight: VH,
      }),
    ).toBe(false);
  });

  it("treats a column scrolled off the top as off-screen", () => {
    expect(
      shouldScrollComposerIntoView({
        lastScrolledAnchorId: null,
        anchorId: "a-1",
        rect: { top: -900, bottom: -100 },
        viewportHeight: VH,
      }),
    ).toBe(true);
  });

  it("counts a column resting exactly at the bottom edge as off-screen", () => {
    expect(
      shouldScrollComposerIntoView({
        lastScrolledAnchorId: null,
        anchorId: "a-1",
        rect: { top: VH, bottom: VH + 400 },
        viewportHeight: VH,
      }),
    ).toBe(true);
  });

  it("keeps a partially visible column put", () => {
    expect(
      shouldScrollComposerIntoView({
        lastScrolledAnchorId: null,
        anchorId: "a-1",
        rect: { top: VH - 40, bottom: VH + 400 },
        viewportHeight: VH,
      }),
    ).toBe(false);
  });
});
