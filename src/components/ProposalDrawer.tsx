"use client";

import { useEffect, useState } from "react";
import type { ProposalRow } from "@/lib/db/queries";
import { ProposalCard } from "./ProposalCard";
import { SuggestChangesComposer } from "./SuggestChangesComposer";

interface OpenDetail {
  mode: string;
  anchorId: string;
}

interface Props {
  baseVersionId: string;
  /** Pre-fetched at SSR: anchorId → list of proposals. */
  proposalsByAnchor: Record<string, ProposalRow[]>;
  /** Pre-fetched at SSR: anchorId → original sentence text. */
  originalTextByAnchor: Record<string, string>;
  /** Whether the current user is an admin. */
  isAdmin: boolean;
}

export function ProposalDrawer({
  baseVersionId,
  proposalsByAnchor,
  originalTextByAnchor,
  isAdmin,
}: Props) {
  const [openAnchor, setOpenAnchor] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const d = (e as CustomEvent<OpenDetail>).detail;
      if (d.mode !== "proposals") return;
      setOpenAnchor(d.anchorId);
      setComposing(false);
    };
    const onSuggest = (e: Event) => {
      const d = (e as CustomEvent<{ anchorId: string }>).detail;
      setOpenAnchor(d.anchorId);
      setComposing(true);
    };
    window.addEventListener("anchor-open", onOpen);
    window.addEventListener("compose-suggest", onSuggest);
    return () => {
      window.removeEventListener("anchor-open", onOpen);
      window.removeEventListener("compose-suggest", onSuggest);
    };
  }, []);

  if (!openAnchor) return null;

  const proposals = proposalsByAnchor[openAnchor] ?? [];
  const originalText = originalTextByAnchor[openAnchor];

  return (
    <aside className="fixed right-0 top-0 z-40 flex h-full w-full max-w-md flex-col border-l border-zinc-200 bg-white shadow-xl sm:w-96">
      <header className="flex items-center justify-between border-b border-zinc-200 p-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-zinc-500">
            Proposed Edits
          </p>
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

      {originalText && (
        <div className="border-b border-zinc-100 bg-zinc-50 px-4 py-3">
          <p className="text-[10px] font-medium uppercase tracking-widest text-zinc-400 mb-1">
            Current text
          </p>
          <p className="text-sm leading-relaxed text-zinc-700">{originalText}</p>
        </div>
      )}

      <div className="flex-1 overflow-auto p-4 space-y-3">
        {proposals.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No proposals for this sentence yet. Be the first to suggest a change.
          </p>
        ) : (
          proposals.map((p) => (
            <ProposalCard
              key={p.id}
              proposal={p}
              originalText={originalText}
              isAdmin={isAdmin}
            />
          ))
        )}
      </div>

      <footer className="border-t border-zinc-200 p-4">
        {composing ? (
          <SuggestChangesComposer
            baseVersionId={baseVersionId}
            targetAnchorId={openAnchor}
            originalText={originalText}
            onSubmitted={() => setComposing(false)}
            onCancel={() => setComposing(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setComposing(true)}
            className="w-full rounded-md border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100"
          >
            ✏️ Suggest a change
          </button>
        )}
      </footer>
    </aside>
  );
}
