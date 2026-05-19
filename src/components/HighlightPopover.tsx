"use client";

import { useEffect, useState } from "react";

interface OpenDetail {
  anchorId: string;
  selectedText: string;
  rect: { top: number; left: number; width: number; height: number };
}

interface Props {
  /**
   * When false (phase 2 default), the "Suggest Changes" button is rendered
   * disabled with a tooltip. Phase 3 flips this to true.
   */
  enableSuggestChanges?: boolean;
}

/**
 * Listens for `selection-in-anchor` window events emitted by DocumentRenderer
 * when the user selects text inside an anchored sentence. Positions a small
 * popover near the selection with Comment / Suggest Changes buttons.
 */
export function HighlightPopover({
  enableSuggestChanges = false,
}: Props) {
  const [open, setOpen] = useState<OpenDetail | null>(null);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<OpenDetail>).detail;
      setOpen(detail);
    };
    const onClose = () => setOpen(null);
    window.addEventListener("selection-in-anchor", onOpen);
    window.addEventListener("mousedown", onClose);
    return () => {
      window.removeEventListener("selection-in-anchor", onOpen);
      window.removeEventListener("mousedown", onClose);
    };
  }, []);

  if (!open) return null;

  // Position above the selection.
  const top = open.rect.top + window.scrollY - 44;
  const left =
    open.rect.left + window.scrollX + open.rect.width / 2 - 90;

  return (
    <div
      style={{ top, left }}
      className="absolute z-50 flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-1.5 py-1 shadow-lg"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => {
          window.dispatchEvent(
            new CustomEvent("compose-comment", { detail: open }),
          );
          setOpen(null);
        }}
        className="rounded-full px-3 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-100"
      >
        💬 Comment
      </button>
      <button
        type="button"
        disabled={!enableSuggestChanges}
        onClick={() => {
          if (!enableSuggestChanges) return;
          window.dispatchEvent(
            new CustomEvent("compose-suggest", { detail: open }),
          );
          setOpen(null);
        }}
        className={`rounded-full px-3 py-1 text-xs font-medium ${
          enableSuggestChanges
            ? "bg-blue-600 text-white hover:bg-blue-700"
            : "cursor-not-allowed bg-zinc-100 text-zinc-400"
        }`}
        title={
          enableSuggestChanges
            ? "Propose a sentence-level edit"
            : "Coming soon"
        }
      >
        ✏️ Suggest Changes
      </button>
    </div>
  );
}
