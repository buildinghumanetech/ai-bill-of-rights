"use client";
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

/**
 * Wraps the interactive article list and listens for mouseup events to detect
 * text selections inside AnchorSentence spans. When a selection is found within
 * a data-anchor-id element, dispatches a "selection-in-anchor" custom event
 * that HighlightPopover listens to.
 */
export function ArticleSelectionContainer({
  children,
}: {
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    function onMouseUp() {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) return;
      const text = sel.toString().trim();
      if (!text) return;

      // Walk up from the anchor node to find the nearest data-anchor-id attribute.
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

    el.addEventListener("mouseup", onMouseUp);
    return () => el.removeEventListener("mouseup", onMouseUp);
  }, []);

  return <div ref={ref}>{children}</div>;
}
