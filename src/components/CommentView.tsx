"use client";

import type { ThreadedComment, SignerForAdminPostAs, SignerForMention } from "@/lib/db/queries";
import { CommentNode } from "./CommentNode";
import { NewCommentForm } from "./NewCommentForm";

/**
 * Check if two selectedText spans overlap (either is a superset/subset of the other,
 * or they partially overlap). Returns true when there is any character-level intersection
 * detected via simple indexOf comparison.
 */
function textsOverlap(a: string, b: string): boolean {
  if (!a || !b) return false;
  // One contains the other, or there is a shared substring.
  // We test containment in both directions, and partial overlap via indexOf on the shorter.
  if (a.includes(b) || b.includes(a)) return true;
  // Partial word overlap: check if any prefix of b (≥10 chars) appears at the end of a, or vice versa.
  const minOverlap = Math.min(10, Math.floor(Math.min(a.length, b.length) / 2));
  for (let len = minOverlap; len <= Math.min(a.length, b.length); len++) {
    if (a.endsWith(b.slice(0, len)) || b.endsWith(a.slice(0, len))) return true;
  }
  return false;
}

interface Props {
  comment: ThreadedComment;
  viewerSignerId: string | null;
  isAdmin: boolean;
  signersForAdmin: SignerForAdminPostAs[];
  signersForMention: SignerForMention[];
  baseVersionId: string;
  /** Kept for API back-compat; no longer rendered (no Close button). */
  onClose?: () => void;
  /** Called when a new top-level sibling comment is posted. */
  onPostedTopLevel?: (newCommentId: string) => void;
  /** Called when the user clicks Cancel on the bottom composer — deactivates the active comment. */
  onDeactivate?: () => void;
  /** All top-level comments for the same anchor, used to find overlapping (related) comments. */
  allThreadedComments?: ThreadedComment[];
  /** Called to switch the active comment to a different id (e.g. clicking a related comment). */
  onActiveChange?: (id: string | null) => void;
}

/**
 * Right-column comment view. Shows the selected-text quote if present,
 * then the threaded comment tree rooted at this comment. A new-comment
 * composer sits below the thread so the viewer can add another top-level
 * comment on the same selected text without replying to anyone specific.
 */
export function CommentView({
  comment,
  viewerSignerId,
  isAdmin,
  signersForAdmin,
  signersForMention,
  baseVersionId,
  onPostedTopLevel,
  onDeactivate,
  allThreadedComments = [],
  onActiveChange,
}: Props) {
  // Issue 4: find related (overlapping) comments on the same anchor.
  const relatedComments: ThreadedComment[] = comment.selectedText
    ? allThreadedComments.filter(
        (c) =>
          c.id !== comment.id &&
          c.anchorId === comment.anchorId &&
          c.selectedText &&
          textsOverlap(comment.selectedText!, c.selectedText),
      )
    : [];

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
        signersForMention={signersForMention}
        depth={0}
        baseVersionId={baseVersionId}
        rootAnchorId={comment.anchorId}
      />
      {/* Top-level composer for adding a sibling comment on the same quote.
          The quote is already shown above the thread, so don't repeat it.
          Cancel clears the body AND calls onDeactivate to reset the active comment. */}
      {comment.anchorId && baseVersionId && (
        <div className="mt-6 border-t border-zinc-200 pt-4">
          <NewCommentForm
            baseVersionId={baseVersionId}
            anchorId={comment.anchorId}
            selectedText={comment.selectedText ?? ""}
            viewerSignerId={viewerSignerId}
            isAdmin={isAdmin}
            signersForAdmin={signersForAdmin}
            signersForMention={signersForMention}
            showQuote={false}
            onCancel={() => {
              // Deactivate the active comment — the CommentView unmounts,
              // so the form body is reset automatically.
              onDeactivate?.();
            }}
            onSubmittedNewTopLevel={onPostedTopLevel}
          />
        </div>
      )}

      {/* Issue 4: Related comments section */}
      {relatedComments.length > 0 && (
        <div className="mt-4 border-t border-zinc-200 pt-4 space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
            Related to this quote
          </p>
          {relatedComments.map((rc) => (
            <button
              key={rc.id}
              type="button"
              onClick={() => onActiveChange?.(rc.id)}
              disabled={!onActiveChange}
              className="block w-full rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-left space-y-1 transition-colors hover:border-zinc-300 hover:bg-white disabled:cursor-default"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-semibold text-zinc-700">{rc.displayName}</span>
                <span className="text-xs text-zinc-400">{rc.score} pts</span>
              </div>
              <p className="text-xs text-zinc-600 line-clamp-2 leading-relaxed">{rc.body}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
