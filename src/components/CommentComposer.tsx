"use client";

import { submitCommentAction } from "@/server/actions/comments";

interface Props {
  versionId: string;
  versionString: string;
  anchorId: string;
  parentCommentId?: string | null;
  placeholder?: string;
}

export function CommentComposer({
  versionId,
  versionString,
  anchorId,
  parentCommentId = null,
  placeholder = "Write a comment…",
}: Props) {
  return (
    <form action={submitCommentAction} className="mt-2 flex flex-col gap-2">
      <input type="hidden" name="versionId" value={versionId} />
      <input type="hidden" name="versionString" value={versionString} />
      <input type="hidden" name="anchorId" value={anchorId} />
      {parentCommentId ? (
        <input type="hidden" name="parentCommentId" value={parentCommentId} />
      ) : null}
      <textarea
        name="body"
        required
        maxLength={5000}
        rows={3}
        placeholder={placeholder}
        className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
      />
      <button
        type="submit"
        className="self-start rounded-full bg-zinc-900 px-4 py-1.5 text-xs font-medium text-white dark:bg-zinc-50 dark:text-zinc-950"
      >
        Post
      </button>
    </form>
  );
}
