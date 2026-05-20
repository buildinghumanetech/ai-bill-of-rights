"use client";

import { useEffect, useState } from "react";
import type { ThreadedComment, SignerForAdminPostAs } from "@/lib/db/queries";
import { findCommentInTree, flattenTree } from "@/lib/db/queries";
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

/** Relative time helper — copied from CommentNode to avoid a shared util file. */
function relativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}

/**
 * Sticky right column for the Proposed tab.
 *
 * State machine:
 *   - Idle: show all-comments list + placeholder when empty
 *   - Pending selection: show NewCommentForm composer; all-list still visible below
 *   - Active comment: show CommentView (threaded); all-list still visible below
 *
 * Clicking a saved cyan highlight (from HomepageArticles) sets activeCommentId,
 * which dismisses any pending composer. A new text selection sets pendingSelection,
 * which clears activeCommentId. The all-list is always visible below the active area
 * so users can see all persisted comments regardless of inline highlight status.
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

  // Find the active comment in the threaded tree (depth-first)
  const activeComment = activeCommentId
    ? findCommentInTree(threadedComments, activeCommentId)
    : null;

  // Top-level comments only for the all-list (replies live inside CommentView).
  // Sort by createdAt desc so newest comments appear first.
  const topLevelComments = [...threadedComments].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  // Also include any "shadowed" comments (those that have a selectedText but no
  // inline highlight because of overlap or cross-sentence selection). The all-list
  // shows every top-level comment regardless of whether it has an inline highlight.
  const totalCommentCount = flattenTree(threadedComments).length;

  return (
    <div className="space-y-4 pt-5">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
        Comments {totalCommentCount > 0 ? `(${totalCommentCount})` : ""}
      </h3>

      {/* Active area: composer or comment view */}
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
      ) : topLevelComments.length === 0 ? (
        <p className="text-sm text-zinc-500 leading-relaxed">
          Highlight any text to comment or suggest changes.
        </p>
      ) : null}

      {/* All-comments list — always visible so every persisted comment is discoverable */}
      {topLevelComments.length > 0 && (
        <div className="mt-4 space-y-2">
          {activeComment && (
            <p className="text-xs text-zinc-400 italic">All comments</p>
          )}
          {topLevelComments.map((c) => {
            const isActive = c.id === activeCommentId;
            const replyCount = flattenTree(c.replies).length;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onActiveChange(c.id)}
                className={[
                  "w-full text-left rounded-lg border px-3 py-2.5 transition-colors",
                  isActive
                    ? "border-cyan-400 bg-cyan-50"
                    : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50",
                ].join(" ")}
              >
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-zinc-700 truncate max-w-[140px]">
                    {c.displayName}
                  </span>
                  <span className="text-xs text-zinc-400 shrink-0">
                    {relativeTime(new Date(c.createdAt))}
                  </span>
                  {replyCount > 0 && (
                    <span className="ml-auto text-xs text-zinc-400 shrink-0">
                      {replyCount} {replyCount === 1 ? "reply" : "replies"}
                    </span>
                  )}
                </div>
                {c.selectedText && (
                  <p className="mt-1 text-xs italic text-zinc-500 truncate">
                    &ldquo;{c.selectedText}&rdquo;
                  </p>
                )}
                <p className="mt-0.5 text-sm text-zinc-700 line-clamp-2">
                  {c.body}
                </p>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
