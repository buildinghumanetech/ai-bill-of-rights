"use client";

import { FormEvent, useState, useTransition } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { submitProposalAction } from "@/server/actions/proposals";

interface Props {
  baseVersionId: string;
  targetAnchorId: string;
  originalText?: string;
  /** Called after a successful submit so the drawer can update. */
  onSubmitted?: () => void;
  onCancel?: () => void;
}

type Kind = "replace" | "insert_after" | "delete";

const KIND_LABELS: Record<Kind, string> = {
  replace: "Replace sentence",
  insert_after: "Insert sentence after",
  delete: "Remove sentence",
};

export function SuggestChangesComposer({
  baseVersionId,
  targetAnchorId,
  originalText,
  onSubmitted,
  onCancel,
}: Props) {
  const [kind, setKind] = useState<Kind>("replace");
  const [newText, setNewText] = useState("");
  const [rationale, setRationale] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { isSignedIn } = useAuth();
  const router = useRouter();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (kind !== "delete" && !newText.trim()) {
      setError("Proposed text cannot be empty.");
      return;
    }

    if (!isSignedIn) {
      // Save a lightweight draft to sessionStorage so we can restore after OTP.
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.setItem(
          "proposal-draft",
          JSON.stringify({
            baseVersionId,
            targetAnchorId,
            kind,
            newText: newText.trim(),
            rationale: rationale.trim(),
          }),
        );
      }
      window.dispatchEvent(new CustomEvent("open-sign-modal"));
      return;
    }

    startTransition(async () => {
      const fd = new FormData();
      fd.set("baseVersionId", baseVersionId);
      fd.set("targetAnchorId", targetAnchorId);
      fd.set("kind", kind);
      if (kind !== "delete") fd.set("newText", newText.trim());
      if (rationale.trim()) fd.set("rationale", rationale.trim());

      const res = await submitProposalAction(fd);
      if (!res.ok) {
        setError(res.error ?? "Couldn't save your proposal.");
        return;
      }
      setNewText("");
      setRationale("");
      router.refresh();
      onSubmitted?.();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {originalText && (
        <div className="rounded-md bg-zinc-50 border border-zinc-200 px-3 py-2 text-sm text-zinc-600 leading-relaxed">
          <span className="block text-[10px] font-medium uppercase tracking-widest text-zinc-400 mb-1">
            Current text
          </span>
          {originalText}
        </div>
      )}

      {/* Kind selector */}
      <fieldset>
        <legend className="text-xs font-medium text-zinc-700 mb-1.5">Change type</legend>
        <div className="flex flex-wrap gap-2">
          {(["replace", "insert_after", "delete"] as Kind[]).map((k) => (
            <label
              key={k}
              className={`flex items-center gap-1.5 cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                kind === k
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400"
              }`}
            >
              <input
                type="radio"
                name="kind"
                value={k}
                checked={kind === k}
                onChange={() => setKind(k)}
                className="sr-only"
              />
              {KIND_LABELS[k]}
            </label>
          ))}
        </div>
      </fieldset>

      {kind !== "delete" && (
        <div>
          <label className="block text-xs font-medium text-zinc-700 mb-1">
            {kind === "replace" ? "Replacement text" : "New sentence to insert"}
          </label>
          <textarea
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            rows={3}
            placeholder={
              kind === "replace"
                ? "Write the improved version of this sentence…"
                : "Write the new sentence to add after this one…"
            }
            className="w-full resize-none rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-zinc-700 mb-1">
          Rationale <span className="text-zinc-400 font-normal">(optional)</span>
        </label>
        <textarea
          value={rationale}
          onChange={(e) => setRationale(e.target.value)}
          rows={2}
          placeholder="Why this change? What does it improve?"
          className="w-full resize-none rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        />
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
      )}

      <div className="flex justify-end gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full px-3 py-1 text-xs text-zinc-700 hover:bg-zinc-100"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-blue-600 px-4 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {pending ? "Saving…" : isSignedIn ? "Submit proposal" : "Sign in & submit"}
        </button>
      </div>
    </form>
  );
}
