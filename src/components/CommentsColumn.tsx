"use client";

import { useEffect, useState } from "react";
import type { CommentWithSelection } from "@/lib/db/queries";
import { NewCommentForm } from "./NewCommentForm";
import { CommentView } from "./CommentView";

interface SelectionEvent {
  anchorId: string;
  selectedText: string;
  rect: { top: number; left: number; width: number; height: number };
}

interface Props {
  baseVersionId: string | null;
  comments: CommentWithSelection[];
  activeCommentId: string | null;
  onActiveChange: (id: string | null) => void;
}

/**
 * Sticky right column for the Proposed tab.
 *
 * State machine:
 *   - Idle: show placeholder text
 *   - Pending selection: show NewCommentForm composer
 *   - Active comment: show CommentView
 *
 * Clicking a saved cyan highlight (from HomepageArticles) sets activeCommentId,
 * which dismisses any pending composer. A new text selection sets pendingSelection,
 * which clears activeCommentId.
 */
export function CommentsColumn({
  baseVersionId,
  comments,
  activeCommentId,
  onActiveChange,
}: Props) {
  const [pendingSelection, setPendingSelection] = useState<SelectionEvent | null>(null);

  // Listen for text-selection events emitted by ArticleSelectionContainer.
  useEffect(() => {
    const onSelect = (e: Event) => {
      const detail = (e as CustomEvent<SelectionEvent>).detail;
      setPendingSelection(detail);
      onActiveChange(null);
    };
    window.addEventListener("selection-in-anchor", onSelect);
    return () => window.removeEventListener("selection-in-anchor", onSelect);
  }, [onActiveChange]);

  // Clicking a saved highlight clears any in-progress composer.
  useEffect(() => {
    if (activeCommentId) setPendingSelection(null);
  }, [activeCommentId]);

  const activeComment = activeCommentId
    ? comments.find((c) => c.id === activeCommentId) ?? null
    : null;

  return (
    <div className="space-y-4">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
        Comments
      </h3>

      {pendingSelection && baseVersionId ? (
        <NewCommentForm
          baseVersionId={baseVersionId}
          anchorId={pendingSelection.anchorId}
          selectedText={pendingSelection.selectedText}
          onCancel={() => setPendingSelection(null)}
        />
      ) : activeComment ? (
        <CommentView comment={activeComment} onClose={() => onActiveChange(null)} />
      ) : (
        <p className="text-sm text-zinc-500 leading-relaxed">
          Highlight any text in the article to start a comment. Click an existing cyan highlight to read its thread.
        </p>
      )}

      {/* TODO Pass 2: render full list of all comments below */}
    </div>
  );
}
