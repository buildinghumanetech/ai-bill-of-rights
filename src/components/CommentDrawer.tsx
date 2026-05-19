"use client";

import { useState, useEffect } from "react";
import type { CommentTreeItem } from "@/lib/db/queries";
import { CommentThread } from "./CommentThread";
import { CommentComposer } from "./CommentComposer";

interface Props {
  versionId: string;
  versionString: string;
  initialComments: CommentTreeItem[];
  isSignedIn: boolean;
}

export function CommentDrawer({
  versionId,
  versionString,
  initialComments,
  isSignedIn,
}: Props) {
  const [openAnchor, setOpenAnchor] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ anchorId: string }>).detail;
      setOpenAnchor(detail.anchorId);
    };
    window.addEventListener("anchor-open", handler);
    return () => window.removeEventListener("anchor-open", handler);
  }, []);

  if (!openAnchor) return null;
  const filtered = initialComments.filter((c) => c.anchorId === openAnchor);

  return (
    <aside className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-950 sm:w-96">
      <div className="flex items-center justify-between border-b border-zinc-200 p-4 dark:border-zinc-800">
        <div>
          <p className="text-xs uppercase tracking-widest text-zinc-500">Discussion</p>
          <p className="text-sm font-medium">{openAnchor}</p>
        </div>
        <button
          type="button"
          onClick={() => setOpenAnchor(null)}
          className="rounded-full px-3 py-1 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          Close
        </button>
      </div>
      <div className="flex-1 overflow-auto p-4">
        {filtered.length === 0 ? (
          <p className="text-sm text-zinc-500">No comments on this sentence yet.</p>
        ) : (
          <CommentThread
            comments={filtered}
            versionId={versionId}
            versionString={versionString}
            anchorId={openAnchor}
          />
        )}
      </div>
      <div className="border-t border-zinc-200 p-4 dark:border-zinc-800">
        {isSignedIn ? (
          <CommentComposer
            versionId={versionId}
            versionString={versionString}
            anchorId={openAnchor}
            placeholder="Add a comment…"
          />
        ) : (
          <p className="text-xs text-zinc-500">Sign the document to comment.</p>
        )}
      </div>
    </aside>
  );
}
