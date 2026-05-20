"use client";

import type { ThreadedComment, SignerForAdminPostAs } from "@/lib/db/queries";
import { CommentNode } from "./CommentNode";
import { NewCommentForm } from "./NewCommentForm";

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
 * then the threaded comment tree rooted at this comment. A new-comment
 * composer sits below the thread so the viewer can add another top-level
 * comment on the same selected text without replying to anyone specific.
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
      {/* Top-level composer for adding a sibling comment on the same quote.
          The quote is already shown above the thread, so don't repeat it. */}
      {comment.anchorId && baseVersionId && (
        <div className="mt-6 border-t border-zinc-200 pt-4">
          <NewCommentForm
            baseVersionId={baseVersionId}
            anchorId={comment.anchorId}
            selectedText={comment.selectedText ?? ""}
            viewerSignerId={viewerSignerId}
            isAdmin={isAdmin}
            signersForAdmin={signersForAdmin}
            showQuote={false}
            onCancel={() => { /* no-op — composer is persistent at the bottom */ }}
          />
        </div>
      )}
    </div>
  );
}
