"use client";

import { useEffect, useRef, useState } from "react";
import type { ThreadedComment, SignerForAdminPostAs, SignerForMention } from "@/lib/db/queries";
import { findCommentInTree } from "@/lib/db/queries";
import { countComments, commentCountLabel } from "@/lib/comments/count";
import {
  COMPOSER_CLOSED_EVENT,
  SELECTION_EVENT,
  shouldScrollComposerIntoView,
  type AnchoredSelection,
} from "@/lib/comments/selection";
import { NewCommentForm } from "./NewCommentForm";
import { CommentView } from "./CommentView";

interface Props {
  baseVersionId: string | null;
  threadedComments: ThreadedComment[];
  activeCommentId: string | null;
  viewerSignerId: string | null;
  isAdmin: boolean;
  signersForAdmin: SignerForAdminPostAs[];
  signersForMention: SignerForMention[];
  onActiveChange: (id: string | null) => void;
  /** Called when a new top-level comment is posted; sets the new comment as active. */
  onPostedTopLevel?: (newCommentId: string) => void;
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
  signersForMention,
  onActiveChange,
  onPostedTopLevel,
}: Props) {
  const [pendingSelection, setPendingSelection] = useState<AnchoredSelection | null>(null);
  const columnRef = useRef<HTMLDivElement | null>(null);
  /** Anchor the column was last scrolled to; see shouldScrollComposerIntoView. */
  const lastScrolledAnchorRef = useRef<string | null>(null);

  // Listen for text-selection events emitted by ArticleSelectionContainer.
  useEffect(() => {
    const onSelect = (e: Event) => {
      const detail = (e as CustomEvent<AnchoredSelection>).detail;
      setPendingSelection(detail);
      onActiveChange(null);

      requestAnimationFrame(() => {
        const el = columnRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        if (
          !shouldScrollComposerIntoView({
            lastScrolledAnchorId: lastScrolledAnchorRef.current,
            anchorId: detail.anchorId,
            rect,
            viewportHeight: window.innerHeight,
          })
        ) {
          return;
        }
        lastScrolledAnchorRef.current = detail.anchorId;
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    };
    window.addEventListener(SELECTION_EVENT, onSelect);
    return () => window.removeEventListener(SELECTION_EVENT, onSelect);
  }, [onActiveChange]);

  /**
   * Every path that dismisses the composer must come through here. Clearing
   * `pendingSelection` without also clearing the container's dedupe guard is
   * what made the guard go sticky in the first place.
   */
  function closeComposer() {
    lastScrolledAnchorRef.current = null;
    setPendingSelection(null);
    window.dispatchEvent(new CustomEvent(COMPOSER_CLOSED_EVENT));
  }

  // Activating a saved highlight (click, or Enter/Space — they're focusable
  // buttons) clears any in-progress composer. This has to go through
  // closeComposer too: mouse users happen to be rescued by the container's
  // mousedown reset, but a keyboard user would otherwise leave the dedupe
  // guard stale and be unable to re-select the same phrase.
  useEffect(() => {
    if (activeCommentId) closeComposer();
  }, [activeCommentId]);

  const activeComment = activeCommentId
    ? findCommentInTree(threadedComments, activeCommentId)
    : null;

  const totalComments = countComments(threadedComments);

  return (
    <div ref={columnRef} className="space-y-4 pt-5">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
        Comments{totalComments > 0 ? ` · ${totalComments}` : ""}
      </h3>

      {pendingSelection && baseVersionId ? (
        <NewCommentForm
          baseVersionId={baseVersionId}
          anchorId={pendingSelection.anchorId}
          selectedText={pendingSelection.selectedText}
          viewerSignerId={viewerSignerId}
          isAdmin={isAdmin}
          signersForAdmin={signersForAdmin}
          signersForMention={signersForMention}
          onCancel={closeComposer}
          onSubmittedNewTopLevel={(newCommentId) => {
            // Dismiss the pending-selection composer, then promote the new
            // comment to active so the user sees it immediately.
            closeComposer();
            onPostedTopLevel?.(newCommentId);
          }}
        />
      ) : activeComment ? (
        <CommentView
          comment={activeComment}
          viewerSignerId={viewerSignerId}
          isAdmin={isAdmin}
          signersForAdmin={signersForAdmin}
          signersForMention={signersForMention}
          baseVersionId={baseVersionId ?? ""}
          onClose={() => onActiveChange(null)}
          onPostedTopLevel={onPostedTopLevel}
          onDeactivate={() => onActiveChange(null)}
          allThreadedComments={threadedComments}
          onActiveChange={onActiveChange}
        />
      ) : (
        // Idle state. This used to be a single grey sentence that readers
        // missed entirely, leaving them to assume the document was take-it-or-
        // leave-it. Spell the mechanism out instead.
        <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-4">
          <p className="text-sm font-semibold text-zinc-900">
            Your turn — highlight any text to the left.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-zinc-600">
            Drag across a sentence (press and hold on a phone) and a comment box
            opens right here. Object to it, ask a question, or write the wording
            you&apos;d rather see.
          </p>
          <p className="mt-3 text-xs leading-relaxed text-zinc-500">
            {totalComments > 0
              ? `${commentCountLabel(totalComments)} so far. Cyan highlights in the text are other people's — click one to read the thread and reply.`
              : "No comments yet. Yours would be the first."}
          </p>
        </div>
      )}
    </div>
  );
}
