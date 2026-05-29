"use client";

import { FormEvent, useState, useTransition } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { submitCommentAction } from "@/server/actions/comments";
import { saveDraft, clearDraft } from "@/lib/comments/draft";

interface Props {
  baseVersionId: string;
  anchorId?: string;
  proposalId?: string;
  parentCommentId?: string;
  defaultBody?: string;
  onSubmitted?: () => void;
  onCancel?: () => void;
}

export function CommentComposer(props: Props) {
  const [body, setBody] = useState(props.defaultBody ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { isSignedIn } = useAuth();
  const router = useRouter();

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
        baseVersionId: props.baseVersionId,
        anchorId: props.anchorId,
        proposalId: props.proposalId,
        parentCommentId: props.parentCommentId,
        body: trimmed,
        returnTo: window.location.pathname + "?draft=1",
        ts: Date.now(),
      });
      // Trigger Clerk OTP flow by opening the sign modal.
      window.dispatchEvent(new CustomEvent("open-sign-modal", { detail: { mode: "comment-only" } }));
      return;
    }

    startTransition(async () => {
      const fd = new FormData();
      fd.set("baseVersionId", props.baseVersionId);
      if (props.anchorId) fd.set("anchorId", props.anchorId);
      if (props.proposalId) fd.set("proposalId", props.proposalId);
      if (props.parentCommentId) fd.set("parentCommentId", props.parentCommentId);
      fd.set("body", trimmed);
      const res = await submitCommentAction(fd);
      if (!res.ok) {
        setError(res.error ?? "Couldn't save your comment.");
        return;
      }
      clearDraft();
      setBody("");
      router.refresh();
      props.onSubmitted?.();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        placeholder="Add a comment…"
        className="w-full resize-none rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
      />
      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
      ) : null}
      <div className="flex justify-end gap-2">
        {props.onCancel ? (
          <button
            type="button"
            onClick={props.onCancel}
            className="rounded-full px-3 py-1 text-xs text-zinc-700 hover:bg-zinc-100"
          >
            Cancel
          </button>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-zinc-900 px-4 py-1 text-xs font-semibold text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {pending ? "Saving…" : isSignedIn ? "Post" : "Sign in & post"}
        </button>
      </div>
    </form>
  );
}
