"use client";

import type { ReactNode } from "react";

interface Props {
  anchorId: string;
  count: number;
  children: ReactNode;
}

/**
 * Wraps a single sentence inside an article. Exposes the anchorId via
 * `data-anchor-id`. The container's `mouseup` listener (defined on the
 * parent DocumentRenderer) reads the current selection and decides whether
 * to open the HighlightPopover. The small count badge becomes visible on
 * hover and opens the CommentDrawer when clicked.
 */
export function AnchorSentence({ anchorId, count, children }: Props) {
  return (
    <span data-anchor-id={anchorId} className="group relative">
      {children}
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          window.dispatchEvent(
            new CustomEvent("anchor-open-comments", {
              detail: { anchorId },
            }),
          );
        }}
        className="ml-1 hidden h-5 min-w-5 items-center justify-center rounded-full bg-zinc-100 px-1.5 align-middle text-[10px] font-medium text-zinc-600 group-hover:inline-flex hover:bg-zinc-200"
        aria-label={`Discuss this sentence (${count} comments)`}
      >
        {count > 0 ? `💬 ${count}` : "+"}
      </button>
    </span>
  );
}
