"use client";

import { useEffect, useState } from "react";
import type { ThreadedComment, SignerForAdminPostAs } from "@/lib/db/queries";
import { findCommentInTree } from "@/lib/db/queries";
import { NewCommentForm } from "./NewCommentForm";
import { CommentView } from "./CommentView";

interface SelectionEvent {
  anchorId: string;
  selectedText: string;
  rect: { top: number; left: number; width: number; height: number };
}

interface Props {
  baseVersionId: string | null;
  threadedComments: ThreadedComment[];
  activeCommentId: string | null;
  viewerSignerId: string | null;
  isAdmin: boolean;
  signersForAdmin: SignerForAdminPostAs[];
  onActiveChange: (id: string | null) => void;
}

/**
 * Sticky right column for the Proposed tab.
 *
 * State machine:
 *   - Idle: show placeholder text
 *   - Pending selection: show NewCommentForm composer
 *   - Active comment: show CommentView (threaded)
 *
 * Clicking a saved cyan highlight (from HomepageArticles) sets activeCommentId,
 * which dismisses any pending composer. A new text selection sets pendingSelection,
 * which clears activeCommentId.
 */
export function CommentsColumn({
  baseVersionId,
  threadedComments,
  activeCommentId,
  viewerSignerId,
  isAdmin,
  signersForAdmin,
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
    ? findCommentInTree(threadedComments, activeCommentId)
    : null;

  return (
    <div className="space-y-4 pt-5">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
        Comments
      </h3>

      {pendingSelection && baseVersionId ? (
        <NewCommentForm
          baseVersionId={baseVersionId}
          anchorId={pendingSelection.anchorId}
          selectedText={pendingSelection.selectedText}
          viewerSignerId={viewerSignerId}
          isAdmin={isAdmin}
          signersForAdmin={signersForAdmin}
          onCancel={() => setPendingSelection(null)}
        />
      ) : activeComment ? (
        <CommentView
          comment={activeComment}
          viewerSignerId={viewerSignerId}
          isAdmin={isAdmin}
          signersForAdmin={signersForAdmin}
          baseVersionId={baseVersionId ?? ""}
          onClose={() => onActiveChange(null)}
        />
      ) : (
        <p className="text-sm text-zinc-500 leading-relaxed">
          Highlight any text to comment or suggest changes.
        </p>
      )}
    </div>
  );
}
