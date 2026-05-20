"use client";

import type { ThreadedComment, SignerForAdminPostAs } from "@/lib/db/queries";
import { CommentNode } from "./CommentNode";

interface Props {
  comment: ThreadedComment;
  viewerSignerId: string | null;
  isAdmin: boolean;
  signersForAdmin: SignerForAdminPostAs[];
  baseVersionId: string;
  onClose: () => void;
}

/**
 * Right-column comment view. Shows the selected-text quote if present,
 * then the full threaded comment tree rooted at this comment.
 */
export function CommentView({ comment, viewerSignerId, isAdmin, signersForAdmin, baseVersionId, onClose }: Props) {
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
      <button
        type="button"
        onClick={onClose}
        className="text-xs text-zinc-500 underline-offset-2 hover:underline"
      >
        Close
      </button>
    </div>
  );
}
