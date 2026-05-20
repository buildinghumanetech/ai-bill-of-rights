"use client";

import { FormEvent, useEffect, useRef, useState, useTransition } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { submitCommentAction } from "@/server/actions/comments";
import { saveDraft, clearDraft } from "@/lib/comments/draft";

interface OpenDetail {
  anchorId: string;
  selectedText: string;
  rect: { top: number; left: number; width: number; height: number };
}

interface Props {
  baseVersionId: string | null;
}

/**
 * Pops up next to the user's text selection inside an anchored sentence.
 * Shows the highlighted text as a cyan-bg quote and a textarea for leaving
 * a comment. On submit, the comment is saved against the anchor id. The
 * popover dismisses on submit, cancel, Escape, or click outside.
 */
export function HighlightPopover({ baseVersionId }: Props) {
  const [open, setOpen] = useState<OpenDetail | null>(null);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { isSignedIn } = useAuth();
  const router = useRouter();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const onSelect = (e: Event) => {
      const detail = (e as CustomEvent<OpenDetail>).detail;
      setOpen(detail);
      setBody("");
      setError(null);
    };
    function onOutside(e: MouseEvent) {
      if (!cardRef.current) return;
      if (cardRef.current.contains(e.target as Node)) return;
      setOpen(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(null);
    }
    window.addEventListener("selection-in-anchor", onSelect);
    window.addEventListener("mousedown", onOutside);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("selection-in-anchor", onSelect);
      window.removeEventListener("mousedown", onOutside);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    if (open) textareaRef.current?.focus();
  }, [open]);

  if (!open) return null;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!open) return;
    const trimmed = body.trim();
    if (!trimmed) {
      setError("Comment can't be empty.");
      return;
    }
    if (!baseVersionId) {
      setError("Can't post a comment right now.");
      return;
    }
    if (!isSignedIn) {
      saveDraft({
        kind: "comment",
        baseVersionId,
        anchorId: open.anchorId,
        body: trimmed,
        returnTo: window.location.pathname + "?draft=1",
        ts: Date.now(),
      });
      window.dispatchEvent(new CustomEvent("open-sign-modal"));
      return;
    }
    startTransition(async () => {
      const fd = new FormData();
      fd.set("baseVersionId", baseVersionId);
      fd.set("anchorId", open.anchorId);
      fd.set("body", trimmed);
      const res = await submitCommentAction(fd);
      if (!res.ok) {
        setError(res.error ?? "Couldn't save your comment.");
        return;
      }
      clearDraft();
      setBody("");
      setOpen(null);
      router.refresh();
    });
  }

  // Position card below the selection by default; the card's own width is
  // capped so we just left-align with the selection origin.
  const top = open.rect.top + window.scrollY + open.rect.height + 8;
  const left = open.rect.left + window.scrollX;

  return (
    <div
      ref={cardRef}
      style={{ top, left }}
      className="absolute z-50 w-80 rounded-lg border border-zinc-200 bg-white p-3 shadow-xl"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <p className="mb-2 max-h-20 overflow-auto rounded bg-cyan-100 px-2 py-1 text-xs text-zinc-800">
        &ldquo;{open.selectedText}&rdquo;
      </p>
      <form onSubmit={handleSubmit} className="space-y-2">
        <textarea
          ref={textareaRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          placeholder="Add a comment…"
          className="w-full resize-none rounded-md border border-zinc-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        />
        {error ? (
          <p className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">{error}</p>
        ) : null}
        <div className="flex justify-end gap-1">
          <button
            type="button"
            onClick={() => setOpen(null)}
            className="rounded-full px-3 py-1 text-xs text-zinc-700 hover:bg-zinc-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="rounded-full bg-zinc-900 px-4 py-1 text-xs font-semibold text-white hover:bg-zinc-700 disabled:opacity-50"
          >
            {pending ? "Saving…" : isSignedIn ? "Comment" : "Sign in & comment"}
          </button>
        </div>
      </form>
    </div>
  );
}
