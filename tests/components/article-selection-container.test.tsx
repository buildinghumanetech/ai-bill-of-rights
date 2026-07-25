// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { act } from "react";
import { ArticleSelectionContainer } from "@/app/ArticleSelectionContainer";
import { COMPOSER_CLOSED_EVENT, SELECTION_EVENT } from "@/lib/comments/selection";

/**
 * Covers the event wiring that the pure reducer tests can't reach: which
 * signals trigger an emit, and which ones reset the dedupe guard. Three
 * successive reviews found bugs living exactly here.
 */

const SETTLE_MS = 350;

function renderArticle() {
  const events: string[] = [];
  const onEvent = (e: Event) =>
    events.push((e as CustomEvent<{ selectedText: string }>).detail.selectedText);
  window.addEventListener(SELECTION_EVENT, onEvent);

  const utils = render(
    <ArticleSelectionContainer>
      <p data-anchor-id="a-1">Opt-out is not consent.</p>
      <p data-anchor-id="a-2">Buried checkboxes are not consent.</p>
      <p>Not inside any anchor.</p>
    </ArticleSelectionContainer>,
  );

  return {
    events,
    cleanupListener: () => window.removeEventListener(SELECTION_EVENT, onEvent),
    container: utils.container,
  };
}

/** Select a node's contents and let the debounced selectionchange settle. */
function selectAndSettle(el: Element) {
  act(() => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  });
  act(() => {
    vi.advanceTimersByTime(SETTLE_MS + 10);
  });
}

describe("<ArticleSelectionContainer>", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("emits for a touch-style selection that never fires mouseup", () => {
    // The reason the listener exists: press-and-hold on a phone produces no
    // mouseup at all, so before this the whole feature was unusable on mobile.
    const { events, cleanupListener, container } = renderArticle();
    selectAndSettle(container.querySelector('[data-anchor-id="a-1"]')!);
    expect(events).toEqual(["Opt-out is not consent."]);
    cleanupListener();
  });

  it("emits once when mouseup and selectionchange both fire for one gesture", () => {
    const { events, cleanupListener, container } = renderArticle();
    const p = container.querySelector('[data-anchor-id="a-1"]')!;

    act(() => {
      const range = document.createRange();
      range.selectNodeContents(p);
      const sel = window.getSelection()!;
      sel.removeAllRanges();
      sel.addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
      p.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    });
    act(() => {
      vi.advanceTimersByTime(SETTLE_MS + 10);
    });

    expect(events).toHaveLength(1);
    cleanupListener();
  });

  it("ignores selections outside any anchored sentence", () => {
    const { events, cleanupListener, container } = renderArticle();
    selectAndSettle(container.querySelectorAll("p")[2]);
    expect(events).toEqual([]);
    cleanupListener();
  });

  it("emits again for a different sentence", () => {
    const { events, cleanupListener, container } = renderArticle();
    selectAndSettle(container.querySelector('[data-anchor-id="a-1"]')!);
    selectAndSettle(container.querySelector('[data-anchor-id="a-2"]')!);
    expect(events).toHaveLength(2);
    cleanupListener();
  });

  describe("resets the dedupe guard so it can't go sticky", () => {
    it("re-emits the same phrase after the composer closes", () => {
      // The keyboard-user bug: dismissing the composer without clearing the
      // guard left the same phrase permanently unselectable.
      const { events, cleanupListener, container } = renderArticle();
      const p = container.querySelector('[data-anchor-id="a-1"]')!;

      selectAndSettle(p);
      expect(events).toHaveLength(1);

      act(() => {
        window.dispatchEvent(new CustomEvent(COMPOSER_CLOSED_EVENT));
      });
      selectAndSettle(p);

      expect(events).toHaveLength(2);
      cleanupListener();
    });

    it("re-emits the same phrase after a new mousedown gesture", () => {
      const { events, cleanupListener, container } = renderArticle();
      const p = container.querySelector('[data-anchor-id="a-1"]')!;

      selectAndSettle(p);
      act(() => {
        p.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      });
      selectAndSettle(p);

      expect(events).toHaveLength(2);
      cleanupListener();
    });

    it("re-emits the same phrase after the selection is collapsed", () => {
      const { events, cleanupListener, container } = renderArticle();
      const p = container.querySelector('[data-anchor-id="a-1"]')!;

      selectAndSettle(p);
      act(() => {
        window.getSelection()!.removeAllRanges();
        document.dispatchEvent(new Event("selectionchange"));
      });
      act(() => {
        vi.advanceTimersByTime(SETTLE_MS + 10);
      });
      selectAndSettle(p);

      expect(events).toHaveLength(2);
      cleanupListener();
    });
  });
});
