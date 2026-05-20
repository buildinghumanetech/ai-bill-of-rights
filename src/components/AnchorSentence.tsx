"use client";

import type { ReactNode } from "react";

interface Props {
  anchorId: string;
  count: number;
  children: ReactNode;
  /**
   * Controls what drawer opens when the badge is clicked.
   * - "comments" → dispatches anchor-open with mode="comments" (used on / when comments are active)
   * - "proposals" → dispatches anchor-open with mode="proposals" (used on /proposed)
   *
   * Defaults to "comments" for backwards compatibility.
   */
  mode?: "comments" | "proposals";
}

/**
 * Wraps a single sentence inside an article. Exposes the anchorId via
 * `data-anchor-id`. The container's `mouseup` listener (ArticleSelectionContainer)
 * reads the current selection and dispatches a `selection-in-anchor` event for
 * the HighlightPopover. The count badge opens the appropriate drawer when clicked.
 */
export function AnchorSentence({ anchorId, count, mode = "comments", children }: Props) {
  return (
    <span data-anchor-id={anchorId} className="group relative">
      {children}
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          window.dispatchEvent(
            new CustomEvent("anchor-open", {
              detail: { mode, anchorId },
            }),
          );
        }}
        className="ml-1 hidden h-5 min-w-5 items-center justify-center rounded-full bg-zinc-100 px-1.5 align-middle text-[10px] font-medium text-zinc-600 group-hover:inline-flex hover:bg-zinc-200"
        aria-label={
          mode === "proposals"
            ? `View proposals for this sentence (${count})`
            : `Discuss this sentence (${count} comments)`
        }
      >
        {count > 0 ? (mode === "proposals" ? `✏️ ${count}` : `💬 ${count}`) : "+"}
      </button>
    </span>
  );
}
