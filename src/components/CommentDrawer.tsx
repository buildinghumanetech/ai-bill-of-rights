"use client";

import { useEffect, useState } from "react";
import type { CommentRow } from "@/lib/db/queries";
import { CommentComposer } from "./CommentComposer";
import { CommentThread } from "./CommentThread";

interface OpenDetail {
  anchorId: string;
}

interface Props {
  baseVersionId: string;
  /**
   * Pre-fetched at SSR time: map of anchorId -> visible comments for that anchor.
   * Avoids a per-anchor round-trip when the drawer opens.
   */
  commentsByAnchor: Record<string, CommentRow[]>;
}

export function CommentDrawer({ baseVersionId, commentsByAnchor }: Props) {
  const [openAnchor, setOpenAnchor] = useState<string | null>(null);
  const [composeAnchor, setComposeAnchor] = useState<string | null>(null);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const d = (e as CustomEvent<OpenDetail>).detail;
      setOpenAnchor(d.anchorId);
      setComposeAnchor(null);
    };
    const onCompose = (e: Event) => {
      const d = (e as CustomEvent<{ anchorId: string }>).detail;
      setOpenAnchor(d.anchorId);
      setComposeAnchor(d.anchorId);
    };
    window.addEventListener("anchor-open-comments", onOpen);
    window.addEventListener("compose-comment", onCompose);
    return () => {
      window.removeEventListener("anchor-open-comments", onOpen);
      window.removeEventListener("compose-comment", onCompose);
    };
  }, []);

  if (!openAnchor) return null;
  const list = commentsByAnchor[openAnchor] ?? [];

  return (
    <aside className="fixed right-0 top-0 z-40 flex h-full w-full max-w-md flex-col border-l border-zinc-200 bg-white shadow-xl sm:w-96">
      <header className="flex items-center justify-between border-b border-zinc-200 p-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-zinc-500">Discussion</p>
          <p className="text-sm font-mono text-zinc-700">{openAnchor}</p>
        </div>
        <button
          type="button"
          onClick={() => setOpenAnchor(null)}
          className="rounded-full px-3 py-1 text-sm hover:bg-zinc-100"
        >
          Close
        </button>
      </header>
      <div className="flex-1 overflow-auto p-4">
        <CommentThread
          comments={list}
          baseVersionId={baseVersionId}
          anchorId={openAnchor}
        />
      </div>
      <footer className="border-t border-zinc-200 p-4">
        {composeAnchor === openAnchor ? (
          <CommentComposer
            baseVersionId={baseVersionId}
            anchorId={openAnchor}
            onSubmitted={() => setComposeAnchor(null)}
            onCancel={() => setComposeAnchor(null)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setComposeAnchor(openAnchor)}
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
          >
            Add a comment
          </button>
        )}
      </footer>
    </aside>
  );
}
