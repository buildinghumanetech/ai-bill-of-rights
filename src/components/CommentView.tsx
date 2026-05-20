"use client";

import type { ThreadedComment, SignerForAdminPostAs } from "@/lib/db/queries";
import { CommentNode } from "./CommentNode";

interface Props {
  comment: ThreadedComment;
  viewerSignerId: string | null;
  isAdmin: boolean;
  signersForAdmin: SignerForAdminPostAs[];
  baseVersionId: string;
  /** Kept for API back-compat; no longer rendered (no Close button). */
  onClose?: () => void;
}

/**
 * Right-column comment view. Shows the selected-text quote if present,
 * then the threaded comment tree rooted at this comment. No close affordance —
 * the comment stays visible until another highlight is clicked or the user
 * clicks outside the article to clear the active state.
 */
export function CommentView({ comment, viewerSignerId, isAdmin, signersForAdmin, baseVersionId }: Props) {
  return (
    <div className="space-y-3">
      {comment.selectedText && (
        <p className="rounded bg-cyan-100 px-2 py-1 text-xs italic text-zinc-700">
          &ldquo;{comment.selectedText}&rdquo;
        </p>
      )}
      <CommentNode
        comment={comment}
        viewerSignerId={viewerSignerId}
        isAdmin={isAdmin}
        signersForAdmin={signersForAdmin}
        depth={0}
        baseVersionId={baseVersionId}
        rootAnchorId={comment.anchorId}
      />
    </div>
  );
}
