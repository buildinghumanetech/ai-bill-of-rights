"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import type { ThreadedComment, SignerForAdminPostAs } from "@/lib/db/queries";
import { voteCommentAction } from "@/server/actions/comment-votes";
import { reportCommentAction } from "@/server/actions/comment-reports";
import { deleteCommentAction, editCommentAction, submitCommentAction } from "@/server/actions/comments";

interface Props {
  comment: ThreadedComment;
  viewerSignerId: string | null;
  isAdmin: boolean;
  signersForAdmin: SignerForAdminPostAs[];
  depth: number;
  /** baseVersionId is needed when submitting replies. Passed through from the tree root. */
  baseVersionId: string;
  /** anchorId of the root comment — used for replies to keep them anchored. */
  rootAnchorId: string | null;
}

/** Format a Date as a short relative time string, e.g. "2 hours ago". */
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

/** Clamp indentation depth to avoid extreme nesting. */
function indentClass(depth: number): string {
  if (depth === 0) return "";
  const clamped = Math.min(depth, 4);
  return `pl-${clamped * 4} border-l border-zinc-200`;
}

function openSignModal() {
  window.dispatchEvent(new CustomEvent("open-sign-modal"));
}

/**
 * Recursive comment node: renders a comment plus all its replies.
 * Handles voting, replying, flagging, edit, and delete (author or admin).
 */
export function CommentNode({ comment, viewerSignerId, isAdmin, signersForAdmin, depth, baseVersionId, rootAnchorId }: Props) {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(comment.score < -3);
  const [showReply, setShowReply] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [replyError, setReplyError] = useState<string | null>(null);
  const [replyActAsSignerId, setReplyActAsSignerId] = useState<string>("");
  const [flagState, setFlagState] = useState<"idle" | "flagged" | "already" | "error">("idle");
  const [voteState, setVoteState] = useState<{ myVote: 1 | -1 | null; score: number }>({
    myVote: comment.myVote,
    score: comment.score,
  });
  // Edit state
  const [showEdit, setShowEdit] = useState(false);
  const [editBody, setEditBody] = useState(comment.body);
  const [editError, setEditError] = useState<string | null>(null);
  const [, startVoteTransition] = useTransition();
  const [replyPending, startReplyTransition] = useTransition();
  const [, startDeleteTransition] = useTransition();
  const [editPending, startEditTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const isSelf = viewerSignerId === comment.signerId;
  // Author or admin can edit/delete
  const canEditDelete = isSelf || isAdmin;

  function handleVote(direction: 1 | -1) {
    if (!viewerSignerId) {
      openSignModal();
      return;
    }
    if (isSelf) return;

    // Optimistic update
    const prev = voteState;
    setVoteState((v) => {
      const removing = v.myVote === direction;
      const switching = v.myVote !== null && v.myVote !== direction;
      if (removing) return { myVote: null, score: v.score - direction };
      if (switching) return { myVote: direction, score: v.score + direction * 2 };
      return { myVote: direction, score: v.score + direction };
    });

    startVoteTransition(async () => {
      const res = await voteCommentAction(comment.id, direction);
      if (!res.ok) {
        // Roll back on server error
        setVoteState(prev);
      }
      // Server will revalidate on success; no extra refresh needed
    });
  }

  function handleFlag() {
    if (!viewerSignerId) {
      openSignModal();
      return;
    }
    startVoteTransition(async () => {
      const res = await reportCommentAction(comment.id);
      if (!res.ok) {
        setFlagState("error");
      } else if (res.state === "already_reported") {
        setFlagState("already");
      } else {
        setFlagState("flagged");
      }
    });
  }

  function handleDelete() {
    startDeleteTransition(async () => {
      await deleteCommentAction(comment.id);
      router.refresh();
    });
  }

  function handleEditSave() {
    setEditError(null);
    const trimmed = editBody.trim();
    if (!trimmed) {
      setEditError("Comment can't be empty.");
      return;
    }
    startEditTransition(async () => {
      const res = await editCommentAction(comment.id, trimmed);
      if (!res.ok) {
        setEditError(res.error ?? "Couldn't save edit.");
        return;
      }
      setShowEdit(false);
      router.refresh();
    });
  }

  function handleReplySubmit(e: React.FormEvent) {
    e.preventDefault();
    setReplyError(null);
    const trimmed = replyBody.trim();
    if (!trimmed) {
      setReplyError("Reply can't be empty.");
      return;
    }
    if (!viewerSignerId) {
      openSignModal();
      return;
    }
    startReplyTransition(async () => {
      const fd = new FormData();
      fd.set("baseVersionId", baseVersionId);
      fd.set("anchorId", rootAnchorId ?? comment.anchorId ?? "");
      fd.set("parentCommentId", comment.id);
      fd.set("body", trimmed);
      if (isAdmin && replyActAsSignerId) fd.set("actAsSignerId", replyActAsSignerId);
      const res = await submitCommentAction(fd);
      if (!res.ok) {
        setReplyError(res.error ?? "Couldn't save reply.");
        return;
      }
      setReplyBody("");
      setReplyActAsSignerId("");
      setShowReply(false);
      router.refresh();
    });
  }

  if (collapsed) {
    return (
      <div className={`${indentClass(depth)} mt-1`}>
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="text-xs text-zinc-400 italic hover:text-zinc-600"
        >
          [comment hidden by community votes — show]
        </button>
      </div>
    );
  }

  const upActive = voteState.myVote === 1;
  const downActive = voteState.myVote === -1;

  return (
    <div className={`${indentClass(depth)} mt-1 space-y-1`}>
      <div className="flex gap-2">
        {/* Vote column */}
        <div className="flex flex-col items-center gap-0.5 pt-0.5 shrink-0">
          <button
            type="button"
            onClick={() => handleVote(1)}
            disabled={isSelf}
            title={isSelf ? "Can't vote on your own comment" : "Upvote"}
            className={`text-sm leading-none transition-colors ${
              isSelf
                ? "text-zinc-200 cursor-not-allowed"
                : upActive
                ? "text-orange-500 hover:text-orange-400"
                : "text-zinc-400 hover:text-zinc-700"
            }`}
          >
            ▲
          </button>
          <span
            className={`text-xs font-mono leading-none ${
              voteState.score > 0
                ? "text-orange-500"
                : voteState.score < 0
                ? "text-blue-500"
                : "text-zinc-400"
            }`}
          >
            {voteState.score}
          </span>
          <button
            type="button"
            onClick={() => handleVote(-1)}
            disabled={isSelf}
            title={isSelf ? "Can't vote on your own comment" : "Downvote"}
            className={`text-sm leading-none transition-colors ${
              isSelf
                ? "text-zinc-200 cursor-not-allowed"
                : downActive
                ? "text-blue-500 hover:text-blue-400"
                : "text-zinc-400 hover:text-zinc-700"
            }`}
          >
            ▼
          </button>
        </div>

        {/* Comment content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-xs font-semibold text-zinc-700">{comment.displayName}</span>
            <span className="text-xs text-zinc-400">{relativeTime(new Date(comment.createdAt))}</span>
            {/* Edit / Delete for author or admin */}
            {canEditDelete && (
              <span className="ml-auto flex gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setEditBody(comment.body);
                    setEditError(null);
                    setShowEdit((v) => !v);
                  }}
                  className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors"
                >
                  edit
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  className="text-xs text-zinc-400 hover:text-red-600 transition-colors"
                >
                  delete
                </button>
              </span>
            )}
          </div>

          {/* Inline edit composer */}
          {showEdit ? (
            <div className="mt-1 space-y-2">
              <textarea
                autoFocus
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                rows={4}
                className="w-full resize-none rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
              {editError && (
                <p className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">{editError}</p>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowEdit(false)}
                  className="rounded-full px-3 py-1 text-xs text-zinc-600 hover:bg-zinc-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleEditSave}
                  disabled={editPending}
                  className="rounded-full bg-zinc-900 px-4 py-1 text-xs font-semibold text-white hover:bg-zinc-700 disabled:opacity-50"
                >
                  {editPending ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          ) : (
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-zinc-800 break-words">
              {comment.body}
            </p>
          )}

          {/* Action row */}
          <div className="mt-1.5 flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={() => {
                if (!viewerSignerId) {
                  openSignModal();
                  return;
                }
                setShowReply((v) => !v);
              }}
              className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors"
            >
              {showReply ? "cancel" : "reply"}
            </button>

            {flagState === "idle" ? (
              <button
                type="button"
                onClick={handleFlag}
                className="text-xs text-zinc-400 hover:text-red-500 transition-colors ml-auto"
              >
                flag
              </button>
            ) : flagState === "flagged" ? (
              <span className="text-xs text-red-500 ml-auto">flagged</span>
            ) : flagState === "already" ? (
              <span className="text-xs text-zinc-400 ml-auto">already flagged</span>
            ) : (
              <span className="text-xs text-red-400 ml-auto">flag failed</span>
            )}
          </div>

          {/* Inline reply composer */}
          {showReply && (
            <form onSubmit={handleReplySubmit} className="mt-2 space-y-2">
              {/* Admin "post as" dropdown for replies */}
              {isAdmin && signersForAdmin.length > 0 && (
                <div className="flex items-center gap-2">
                  <label className="text-xs text-zinc-500 shrink-0">Posting as:</label>
                  <select
                    value={replyActAsSignerId}
                    onChange={(e) => setReplyActAsSignerId(e.target.value)}
                    className="flex-1 rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/30"
                  >
                    <option value="">me ({signersForAdmin.find((s) => s.id === viewerSignerId)?.displayName ?? "admin"})</option>
                    {signersForAdmin
                      .filter((s) => s.id !== viewerSignerId)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.displayName}
                        </option>
                      ))}
                  </select>
                </div>
              )}
              <textarea
                ref={textareaRef}
                autoFocus
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                rows={3}
                placeholder="Write a reply…"
                className="w-full resize-none rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
              {replyError && (
                <p className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">{replyError}</p>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowReply(false);
                    setReplyBody("");
                    setReplyError(null);
                    setReplyActAsSignerId("");
                  }}
                  className="rounded-full px-3 py-1 text-xs text-zinc-600 hover:bg-zinc-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={replyPending}
                  className="rounded-full bg-zinc-900 px-4 py-1 text-xs font-semibold text-white hover:bg-zinc-700 disabled:opacity-50"
                >
                  {replyPending ? "Saving…" : "Reply"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Recursive replies */}
      {comment.replies.length > 0 && (
        <div className="space-y-1 mt-1">
          {comment.replies.map((reply) => (
            <CommentNode
              key={reply.id}
              comment={reply}
              viewerSignerId={viewerSignerId}
              isAdmin={isAdmin}
              signersForAdmin={signersForAdmin}
              depth={depth + 1}
              baseVersionId={baseVersionId}
              rootAnchorId={rootAnchorId ?? comment.anchorId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
