"use client";

import { FormEvent, useRef, useState, useTransition } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { submitCommentAction } from "@/server/actions/comments";
import { saveDraft, clearDraft } from "@/lib/comments/draft";
import type { SignerForAdminPostAs } from "@/lib/db/queries";

interface Props {
  baseVersionId: string;
  anchorId: string;
  selectedText: string;
  viewerSignerId: string | null;
  isAdmin: boolean;
  signersForAdmin: SignerForAdminPostAs[];
  onCancel: () => void;
  /** Show the cyan-bg selected-text quote above the textarea. Defaults to true. */
  showQuote?: boolean;
}

/**
 * Right-column comment composer. Optionally shows the selected quote at the
 * top (skip when the quote is already visible elsewhere, e.g. above an active
 * thread). Admins get an additional "Posting as" dropdown to attribute the
 * comment to any registered signer.
 */
export function NewCommentForm({
  baseVersionId,
  anchorId,
  selectedText,
  viewerSignerId,
  isAdmin,
  signersForAdmin,
  onCancel,
  showQuote = true,
}: Props) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Default "post as" is the admin themselves (empty string = self)
  const [actAsSignerId, setActAsSignerId] = useState<string>("");
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
      if (isAdmin && actAsSignerId) fd.set("actAsSignerId", actAsSignerId);
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
    <div>
      {/* Quoted preview — hidden when the quote is already shown above the thread */}
      {showQuote && (
        <div className="mb-3 max-h-24 overflow-auto rounded bg-cyan-100 px-3 py-2 text-sm text-zinc-700 italic">
          &ldquo;{selectedText}&rdquo;
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Admin "post as" dropdown — sits where the author name would be on
            a posted comment. No label; the dropdown alone is enough. */}
        {isAdmin && signersForAdmin.length > 0 && (
          <select
            value={actAsSignerId}
            onChange={(e) => setActAsSignerId(e.target.value)}
            className="rounded border border-zinc-300 px-2 py-1 text-xs font-semibold text-zinc-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/30"
          >
            <option value="">
              {signersForAdmin.find((s) => s.id === viewerSignerId)?.displayName ?? "me"}
            </option>
            {signersForAdmin
              .filter((s) => s.id !== viewerSignerId)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.displayName}
                </option>
              ))}
          </select>
        )}

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
