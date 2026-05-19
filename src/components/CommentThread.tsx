"use client";

import { useState } from "react";
import type { CommentRow } from "@/lib/db/queries";
import { CommentComposer } from "./CommentComposer";
import { toggleCommentUpvoteAction } from "@/server/actions/upvotes";
import { useRouter } from "next/navigation";

interface Props {
  comments: CommentRow[];
  baseVersionId: string;
  anchorId?: string;
  proposalId?: string;
}

export function CommentThread({
  comments,
  baseVersionId,
  anchorId,
  proposalId,
}: Props) {
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const router = useRouter();

  // Build a parent → children map; surface top-level first, then nested.
  const childrenByParent = new Map<string | null, CommentRow[]>();
  for (const c of comments) {
    const key = c.parentCommentId ?? null;
    const arr = childrenByParent.get(key) ?? [];
    arr.push(c);
    childrenByParent.set(key, arr);
  }
  const topLevel = childrenByParent.get(null) ?? [];

  async function handleUpvote(commentId: string) {
    await toggleCommentUpvoteAction(commentId);
    router.refresh();
  }

  function renderComment(c: CommentRow, depth: number): React.ReactNode {
    const children = childrenByParent.get(c.id) ?? [];
    return (
      <div
        key={c.id}
        style={{ marginLeft: depth * 16 }}
        className="border-l-2 border-zinc-100 pl-3"
      >
        <p className="text-xs font-medium text-zinc-900">{c.displayName}</p>
        <p className="text-sm text-zinc-800">{c.body}</p>
        <div className="mt-1 flex gap-3 text-xs text-zinc-500">
          <button
            type="button"
            onClick={() => handleUpvote(c.id)}
            className="hover:text-zinc-900"
          >
            👍 Upvote
          </button>
          {depth < 1 ? (
            <button
              type="button"
              onClick={() =>
                setReplyingTo(replyingTo === c.id ? null : c.id)
              }
              className="hover:text-zinc-900"
            >
              {replyingTo === c.id ? "Cancel reply" : "Reply"}
            </button>
          ) : null}
        </div>
        {replyingTo === c.id ? (
          <div className="mt-2">
            <CommentComposer
              baseVersionId={baseVersionId}
              anchorId={anchorId}
              proposalId={proposalId}
              parentCommentId={c.id}
              onSubmitted={() => setReplyingTo(null)}
              onCancel={() => setReplyingTo(null)}
            />
          </div>
        ) : null}
        {children.map((cc) => renderComment(cc, depth + 1))}
      </div>
    );
  }

  if (topLevel.length === 0) {
    return <p className="text-sm text-zinc-500">No comments yet.</p>;
  }

  return <div className="flex flex-col gap-3">{topLevel.map((c) => renderComment(c, 0))}</div>;
}
