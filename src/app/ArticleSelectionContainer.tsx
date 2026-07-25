"use client";
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { shouldEmitSelection, type AnchoredSelection } from "@/lib/comments/selection";

/**
 * Wraps the interactive article list and watches for text selections inside
 * AnchorSentence spans. When a selection is found within a data-anchor-id
 * element, dispatches a "selection-in-anchor" custom event that
 * `<CommentsColumn>` turns into a comment composer.
 *
 * Two signals feed this: `mouseup` (instant, desktop) and a debounced
 * `selectionchange` (the only one that fires when a touch device selects text
 * via press-and-hold — without it there is no way at all to comment from a
 * phone). `shouldEmitSelection` dedupes the two so one gesture yields one
 * event and an in-progress composer is never remounted out from under the user.
 */
const SELECTION_SETTLE_MS = 350;

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

    function emitCurrentSelection() {
      const root = ref.current;
      if (!root) return;

      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        // Selection cleared — allow the same text to be re-selected later.
        lastEmitted = null;
        return;
      }
      const text = sel.toString().trim();
      if (!text) {
        lastEmitted = null;
        return;
      }

      // Walk up from the anchor node to find the nearest data-anchor-id.
      let node: Node | null = sel.anchorNode;
      while (node && node.nodeType !== 1) node = node.parentNode;
      let anchorId: string | null = null;
      let cursor = node as HTMLElement | null;
      while (cursor) {
        const id = cursor.getAttribute?.("data-anchor-id");
        if (id) {
          anchorId = id;
          break;
        }
        cursor = cursor.parentElement;
      }
      if (!anchorId) return;
      // Ignore selections that started outside this article column (e.g. the
      // user selecting their own text inside the composer).
      if (!root.contains(node)) return;

      const next: AnchoredSelection = { anchorId, selectedText: text };
      if (!shouldEmitSelection(lastEmitted, next)) return;
      lastEmitted = next;

      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      window.dispatchEvent(
        new CustomEvent("selection-in-anchor", {
          detail: {
            anchorId,
            selectedText: text,
            rect: {
              top: rect.top,
              left: rect.left,
              width: rect.width,
              height: rect.height,
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

    el.addEventListener("mouseup", onMouseUp);
    document.addEventListener("selectionchange", onSelectionChange);
    return () => {
      el.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("selectionchange", onSelectionChange);
      if (settleTimer) clearTimeout(settleTimer);
    };
  }, []);

  return <div ref={ref}>{children}</div>;
}
