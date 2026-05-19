"use client";

import type { ReactNode } from "react";

interface Props {
  anchorId: string;
  count: number;
  children: ReactNode;
}

export function AnchorSentence({ anchorId, count, children }: Props) {
  return (
    <span data-anchor-id={anchorId} className="group relative">
      {children}
      <button
        type="button"
        onClick={() => {
          window.dispatchEvent(
            new CustomEvent("anchor-open", { detail: { anchorId } }),
          );
        }}
        className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-zinc-100 px-1.5 align-middle text-[10px] font-medium text-zinc-600 opacity-0 transition group-hover:opacity-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
        aria-label={`Discuss this sentence (${count} comments)`}
      >
        {count > 0 ? `💬 ${count}` : "+"}
      </button>
    </span>
  );
}
