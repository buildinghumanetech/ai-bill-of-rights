"use client";

import type { CommentWithSelection } from "@/lib/db/queries";

interface Props {
  comment: CommentWithSelection;
  onClose: () => void;
}

/** Format a Date as a short relative time string, e.g. "2 hours ago". */
function relativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} minute${diffMin !== 1 ? "s" : ""} ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hour${diffHr !== 1 ? "s" : ""} ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay} day${diffDay !== 1 ? "s" : ""} ago`;
  // Fall back to locale date string for older comments.
  return date.toLocaleDateString();
}

/**
 * Displays a single saved comment in the right column.
 * Pass 1: author, timestamp, body, optional quoted selection, and a Close link.
 * Pass 2 will add voting / reply / flag — placeholder row reserved below.
 */
export function CommentView({ comment, onClose }: Props) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      {/* Header */}
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-zinc-900">
            {comment.displayName}
          </p>
          <p className="text-xs text-zinc-500">
            {relativeTime(new Date(comment.createdAt))}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-full p-1 text-xs text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
          aria-label="Close comment"
        >
          ✕
        </button>
      </div>

      {/* Optional quoted selection */}
      {comment.selectedText ? (
        <div className="mb-3 max-h-20 overflow-auto rounded bg-cyan-50 px-3 py-2 text-sm text-zinc-600 italic border border-cyan-100">
          &ldquo;{comment.selectedText}&rdquo;
        </div>
      ) : null}

      {/* Body — React auto-escapes, no dangerouslySetInnerHTML */}
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-800">
        {comment.body}
      </p>

      {/* Pass 2 placeholder: voting / reply / flag */}
      <div className="mt-4 flex items-center gap-3 border-t border-zinc-100 pt-3">
        <button
          type="button"
          disabled
          className="flex items-center gap-1 text-xs text-zinc-300 cursor-not-allowed"
          title="Voting coming in Pass 2"
        >
          ↑ Upvote
        </button>
        <button
          type="button"
          disabled
          className="text-xs text-zinc-300 cursor-not-allowed"
          title="Replies coming in Pass 2"
        >
          Reply
        </button>
        <button
          type="button"
          disabled
          className="ml-auto text-xs text-zinc-300 cursor-not-allowed"
          title="Flagging coming in Pass 2"
        >
          Flag
        </button>
      </div>
    </div>
  );
}
