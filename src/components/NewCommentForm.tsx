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
}

/**
 * Right-column comment composer. Shows the selected quote at the top and a
 * textarea below. Admins get an additional "Posting as" dropdown to attribute
 * the comment to any registered signer. Submits via the server action and
 * refreshes the router so the new highlight appears immediately.
 */
export function NewCommentForm({
  baseVersionId,
  anchorId,
  selectedText,
  viewerSignerId,
  isAdmin,
  signersForAdmin,
  onCancel,
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
    <div className="rounded-lg border border-cyan-200 bg-white p-4 shadow-sm">
      {/* Quoted preview */}
      <div className="mb-3 max-h-24 overflow-auto rounded bg-cyan-50 px-3 py-2 text-sm text-zinc-700 italic border border-cyan-100">
        &ldquo;{selectedText}&rdquo;
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Admin "post as" dropdown */}
        {isAdmin && signersForAdmin.length > 0 && (
          <div className="flex items-center gap-2">
            <label className="text-xs text-zinc-500 shrink-0">Posting as:</label>
            <select
              value={actAsSignerId}
              onChange={(e) => setActAsSignerId(e.target.value)}
              className="flex-1 rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/30"
            >
              <option value="">me ({signersForAdmin.find((s) => s.id === viewerSignerId)?.displayName ?? "admin"})</option>
              {signersForAdmin
                .filter((s) => s.id !== viewerSignerId)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.displayName}
                  </option>
                ))}
            </select>
          </div>
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
