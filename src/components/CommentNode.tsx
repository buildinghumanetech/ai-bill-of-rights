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

/** Clamp indentation depth to avoid extreme nesting.
 *
 * Tailwind's JIT scans for static class strings; dynamic templates like
 * `pl-${n}` don't get picked up, so we use a static lookup table.
 */
const INDENT_BY_DEPTH = ["", "pl-6", "pl-12", "pl-16", "pl-20"];
function indentClass(depth: number): string {
  return INDENT_BY_DEPTH[Math.min(depth, 4)] ?? "pl-20";
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

  const upActive = voteState.myVote === 1;
  const downActive = voteState.myVote === -1;

  return (
    <div className={`${indentClass(depth)} mt-1 space-y-1`}>
      <div className="flex gap-2">
        {/* Comment content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            {/* Score + vote arrows — black for the number, light-gray arrows.
                Sit to the LEFT of the author name. */}
            <span className="flex items-baseline gap-1.5 text-xs text-zinc-700 font-mono">
              <span aria-label="score">{voteState.score}</span>
              <span className="flex items-center leading-none">
                <button
                  type="button"
                  onClick={() => handleVote(1)}
                  disabled={isSelf}
                  title={isSelf ? "Can't vote on your own comment" : "Upvote"}
                  aria-pressed={upActive}
                  className={`text-[10px] leading-none transition-opacity ${
                    isSelf ? "text-zinc-200 cursor-not-allowed" : "text-zinc-400 hover:text-zinc-600"
                  } ${upActive ? "font-bold text-zinc-600" : ""}`}
                >
                  ▲
                </button>
                <button
                  type="button"
                  onClick={() => handleVote(-1)}
                  disabled={isSelf}
                  title={isSelf ? "Can't vote on your own comment" : "Downvote"}
                  aria-pressed={downActive}
                  className={`text-[10px] leading-none transition-opacity -ml-px ${
                    isSelf ? "text-zinc-200 cursor-not-allowed" : "text-zinc-400 hover:text-zinc-600"
                  } ${downActive ? "font-bold text-zinc-600" : ""}`}
                >
                  ▼
                </button>
              </span>
            </span>

            <span className="text-xs font-semibold text-zinc-700">{comment.displayName}</span>
            <span className="text-xs text-zinc-400">{relativeTime(new Date(comment.createdAt))}</span>
            {/* Edit / Delete for author or admin */}
            {canEditDelete && (
              <span className="ml-auto flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setEditBody(comment.body);
                    setEditError(null);
                    setShowEdit((v) => !v);
                  }}
                  aria-label="Edit comment"
                  title="Edit comment"
                  className="text-zinc-400 hover:text-zinc-700 transition-colors"
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="12"
                    height="12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  aria-label="Delete comment"
                  title="Delete comment"
                  className="text-zinc-400 hover:text-red-600 transition-colors"
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="12"
                    height="12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    <path d="M10 11v6M14 11v6" />
                    <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
                  </svg>
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

            {(() => {
              const flagged =
                flagState === "flagged" || flagState === "already";
              const failed = flagState === "error";
              const title = failed
                ? "Couldn't flag"
                : flagged
                ? "You flagged this comment as inappropriate"
                : "Flag as inappropriate";
              return (
                <button
                  type="button"
                  onClick={handleFlag}
                  disabled={flagged || failed}
                  aria-label={title}
                  aria-pressed={flagged}
                  title={title}
                  className={`ml-auto inline-flex transition-colors ${
                    flagged
                      ? "text-red-500 cursor-default"
                      : failed
                      ? "text-red-400 cursor-not-allowed"
                      : "text-zinc-400 hover:text-red-500"
                  }`}
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="12"
                    height="12"
                    fill={flagged ? "currentColor" : "none"}
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                    <line x1="4" y1="22" x2="4" y2="15" />
                  </svg>
                </button>
              );
            })()}
          </div>

          {/* Inline reply composer */}
          {showReply && (
            <form onSubmit={handleReplySubmit} className="mt-2 space-y-2">
              {/* Admin "post as" dropdown — sits in place of the author name. */}
              {isAdmin && signersForAdmin.length > 0 && (
                <select
                  value={replyActAsSignerId}
                  onChange={(e) => setReplyActAsSignerId(e.target.value)}
                  className="rounded border border-zinc-300 px-2 py-1 text-xs font-semibold text-zinc-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/30"
                >
                  <option value="">
                    {signersForAdmin.find((s) => s.id === viewerSignerId)?.displayName ?? "me"}
                  </option>
                  {signersForAdmin
                    .filter((s) => s.id !== viewerSignerId)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.displayName}
                      </option>
                    ))}
                </select>
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
