"use client";

import { FormEvent, useRef, useState, useTransition } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { submitCommentAction } from "@/server/actions/comments";
import { saveDraft, clearDraft } from "@/lib/comments/draft";

interface Props {
  baseVersionId: string;
  anchorId: string;
  selectedText: string;
  onCancel: () => void;
}

/**
 * Right-column comment composer. Shows the selected quote at the top and a
 * textarea below. Submits via the server action and refreshes the router so
 * the new highlight appears immediately.
 */
export function NewCommentForm({
  baseVersionId,
  anchorId,
  selectedText,
  onCancel,
}: Props) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { isSignedIn } = useAuth();
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = body.trim();
    if (!trimmed) {
      setError("Comment can't be empty.");
      return;
    }
    if (!isSignedIn) {
      saveDraft({
        kind: "comment",
        baseVersionId,
        anchorId,
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
      fd.set("anchorId", anchorId);
      fd.set("selectedText", selectedText);
      fd.set("body", trimmed);
      const res = await submitCommentAction(fd);
      if (!res.ok) {
        setError(res.error ?? "Couldn't save your comment.");
        return;
      }
      clearDraft();
      setBody("");
      onCancel();
      router.refresh();
    });
  }

  return (
    <div className="rounded-lg border border-cyan-200 bg-white p-4 shadow-sm">
      {/* Quoted preview */}
      <div className="mb-3 max-h-24 overflow-auto rounded bg-cyan-50 px-3 py-2 text-sm text-zinc-700 italic border border-cyan-100">
        &ldquo;{selectedText}&rdquo;
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <textarea
          ref={textareaRef}
          autoFocus
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          placeholder="Add a comment…"
          className="w-full resize-none rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        />
        {error ? (
          <p className="rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-700">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="rounded-full bg-zinc-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-zinc-700 disabled:opacity-50"
          >
            {pending ? "Saving…" : isSignedIn ? "Comment" : "Sign in & comment"}
          </button>
        </div>
      </form>
    </div>
  );
}
