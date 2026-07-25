"use client";
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { nextSelectionState, type AnchoredSelection } from "@/lib/comments/selection";

/**
 * Wraps the interactive article list and watches for text selections inside
 * AnchorSentence spans. When a selection is found within a data-anchor-id
 * element, dispatches a "selection-in-anchor" custom event that
 * `<CommentsColumn>` turns into a comment composer.
 *
 * Two signals feed this: `mouseup` (instant, desktop) and a debounced
 * `selectionchange` (the only one that fires when a touch device selects text
 * via press-and-hold — without it there is no way at all to comment from a
 * phone). `nextSelectionState` dedupes the two so one gesture yields one event
 * and an in-progress composer is never remounted out from under the user.
 */
const SELECTION_SETTLE_MS = 350;

/** Fired by `<CommentsColumn>` when the composer is dismissed or submitted. */
export const COMPOSER_CLOSED_EVENT = "selection-composer-closed";

export function ArticleSelectionContainer({
  children,
}: {
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let lastEmitted: AnchoredSelection | null = null;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;

    /** Read the live selection, or null if it can't become a comment. */
    function observeSelection(): AnchoredSelection | null {
      const root = ref.current;
      if (!root) return null;

      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
      const text = sel.toString().trim();
      if (!text) return null;

      // Walk up from the anchor node to find the nearest data-anchor-id.
      let node: Node | null = sel.anchorNode;
      while (node && node.nodeType !== 1) node = node.parentNode;
      // Ignore selections outside this article column (e.g. the user selecting
      // their own text inside the composer).
      if (!node || !root.contains(node)) return null;

      let cursor = node as HTMLElement | null;
      while (cursor) {
        const id = cursor.getAttribute?.("data-anchor-id");
        if (id) return { anchorId: id, selectedText: text };
        cursor = cursor.parentElement;
      }
      return null;
    }

    function emitCurrentSelection() {
      const observed = observeSelection();
      const step = nextSelectionState(lastEmitted, observed);
      lastEmitted = step.last;
      if (!step.emit || !observed) return;

      const sel = window.getSelection();
      const rect = sel?.getRangeAt(0).getBoundingClientRect();
      window.dispatchEvent(
        new CustomEvent("selection-in-anchor", {
          detail: {
            anchorId: observed.anchorId,
            selectedText: observed.selectedText,
            rect: {
              top: rect?.top ?? 0,
              left: rect?.left ?? 0,
              width: rect?.width ?? 0,
              height: rect?.height ?? 0,
            },
          },
        }),
      );
    }

    function onMouseUp() {
      emitCurrentSelection();
    }

    // Fires many times during a drag and once when a touch selection settles;
    // waiting for it to go quiet keeps mid-drag states from being emitted.
    function onSelectionChange() {
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(emitCurrentSelection, SELECTION_SETTLE_MS);
    }

    // A new gesture, or a dismissed composer, makes the previous emit history.
    // Without these resets the dedupe guard goes sticky: the collapsed state
    // between two selections is often swallowed by the debounce, so cancelling
    // the composer and re-selecting the very same phrase would do nothing.
    function forgetLastEmit() {
      lastEmitted = null;
    }

    el.addEventListener("mouseup", onMouseUp);
    el.addEventListener("mousedown", forgetLastEmit);
    el.addEventListener("touchstart", forgetLastEmit, { passive: true });
    document.addEventListener("selectionchange", onSelectionChange);
    window.addEventListener(COMPOSER_CLOSED_EVENT, forgetLastEmit);
    return () => {
      el.removeEventListener("mouseup", onMouseUp);
      el.removeEventListener("mousedown", forgetLastEmit);
      el.removeEventListener("touchstart", forgetLastEmit);
      document.removeEventListener("selectionchange", onSelectionChange);
      window.removeEventListener(COMPOSER_CLOSED_EVENT, forgetLastEmit);
      if (settleTimer) clearTimeout(settleTimer);
    };
  }, []);

  return <div ref={ref}>{children}</div>;
}
