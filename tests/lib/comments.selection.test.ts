import { describe, expect, it } from "vitest";
import {
  composerScrollBlock,
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
  const H = 200;
  const at = (top: number) => ({ composerRect: { top, bottom: top + H }, viewportHeight: VH });

  it("scrolls when the composer is entirely below the fold", () => {
    expect(shouldScrollComposerIntoView(at(VH + 400))).toBe(true);
  });

  it("scrolls when the composer has scrolled off the top", () => {
    expect(shouldScrollComposerIntoView(at(-(H + 100)))).toBe(true);
  });

  it("does not scroll when the composer is fully visible", () => {
    expect(shouldScrollComposerIntoView(at(100))).toBe(false);
  });

  it("scrolls when only a sliver is showing", () => {
    // Regression guard: treating any pixel in view as "visible" left the
    // composer effectively below the fold on exactly the case this exists for.
    expect(shouldScrollComposerIntoView(at(VH - 20))).toBe(true);
  });

  it("holds still once more than half the composer is on screen", () => {
    expect(shouldScrollComposerIntoView(at(VH - H * 0.75))).toBe(false);
  });

  it("holds still at exactly the half-visible boundary", () => {
    // The threshold is strict (`< 0.5`), so exactly half counts as visible.
    expect(shouldScrollComposerIntoView(at(VH - H / 2))).toBe(false);
    // One pixel less, and it scrolls.
    expect(shouldScrollComposerIntoView(at(VH - H / 2 + 1))).toBe(true);
  });

  it("holds still for a composer taller than the viewport that fills it", () => {
    // Without clamping the denominator to the viewport, a composer taller than
    // 2x the viewport can never reach the threshold against its own height, so
    // every emit re-scrolls. Reachable on a landscape phone, or on Android
    // where the on-screen keyboard shrinks innerHeight.
    const tall = { composerRect: { top: -400, bottom: 2000 }, viewportHeight: VH };
    expect(shouldScrollComposerIntoView(tall)).toBe(false);
  });

  it("still scrolls a viewport-filling composer that is genuinely off-screen", () => {
    const tall = { composerRect: { top: VH + 100, bottom: VH + 2500 }, viewportHeight: VH };
    expect(shouldScrollComposerIntoView(tall)).toBe(true);
  });

  describe("between 1x and 2x the viewport, where the clamp bites gradually", () => {
    // The 3x-viewport cases above are the easy end: the old code returned true
    // there unconditionally. This is the band an expanded textarea plus a
    // mention list most plausibly produces, and where the clamp changes the
    // requirement rather than merely rescuing it — 1200px tall against an 800px
    // viewport needs 400 visible pixels, not 600.
    const TALL = 1200;
    const band = (visible: number) => ({
      composerRect: { top: VH - visible, bottom: VH - visible + TALL },
      viewportHeight: VH,
    });

    it("holds still just above the clamped threshold", () => {
      // 420/800 = 0.525. Unclamped this was 420/1200 = 0.35, i.e. a scroll —
      // so this assertion is what the clamp actually buys.
      expect(shouldScrollComposerIntoView(band(420))).toBe(false);
    });

    it("scrolls just below the clamped threshold", () => {
      expect(shouldScrollComposerIntoView(band(380))).toBe(true); // 0.475
    });
  });

  it("scrolls for a zero-height rect rather than dividing by zero", () => {
    expect(
      shouldScrollComposerIntoView({ composerRect: { top: 0, bottom: 0 }, viewportHeight: VH }),
    ).toBe(true);
  });

  it("scrolls for a zero-height viewport rather than comparing NaN", () => {
    // Clamping the denominator introduced a second path to 0. `NaN < 0.5` is
    // false, which would silently mean "visible enough" — the wrong direction.
    expect(
      shouldScrollComposerIntoView({ composerRect: { top: 0, bottom: H }, viewportHeight: 0 }),
    ).toBe(true);
  });
});

describe("composerScrollBlock", () => {
  const VH = 800;
  const box = (height: number) => ({
    composerRect: { top: 1000, bottom: 1000 + height },
    viewportHeight: VH,
  });

  it("centres a composer that fits on screen", () => {
    expect(composerScrollBlock(box(200))).toBe("center");
  });

  it("centres a composer that exactly fills the viewport", () => {
    expect(composerScrollBlock(box(VH))).toBe("center");
  });

  it("aligns a composer taller than the viewport to its top", () => {
    // Centering here puts the composer's *middle* on screen, pushing the quote
    // block and the top of the textarea above the fold — and the visibility
    // rule then reads a full viewport of composer as visible and never corrects
    // it. The top is where the user has to type.
    expect(composerScrollBlock(box(VH + 1))).toBe("start");
    expect(composerScrollBlock(box(VH * 3))).toBe("start");
  });
});
