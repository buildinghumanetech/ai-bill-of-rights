"use client";

import { submitUpvoteAction } from "@/server/actions/upvotes";

interface Props {
  commentId: string;
  count: number;
  versionString: string;
}

export function UpvoteButton({ commentId, count, versionString }: Props) {
  return (
    <form action={submitUpvoteAction}>
      <input type="hidden" name="commentId" value={commentId} />
      <input type="hidden" name="versionString" value={versionString} />
      <button
        type="submit"
        className="rounded-full border border-zinc-300 px-2 py-0.5 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
      >
        ▲ {count}
      </button>
    </form>
  );
}
