"use client";

import type { ReactNode } from "react";

interface Props {
  anchorId: string;
  children: ReactNode;
}

/**
 * Wraps a single sentence and exposes its anchor id via `data-anchor-id`.
 * `<ArticleSelectionContainer>`'s mouseup listener walks up from the selection
 * to find this attribute and dispatches a `selection-in-anchor` event with the
 * anchor id + selected text, which `<HighlightPopover>` turns into a comment.
 */
export function AnchorSentence({ anchorId, children }: Props) {
  return <span data-anchor-id={anchorId}>{children}</span>;
}
