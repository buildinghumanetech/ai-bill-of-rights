"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  decideProposalAction,
  unhideProposalAction,
  withdrawProposalAction,
} from "@/server/actions/proposals";

export function AdminProposalActions({
  proposalId,
  status,
  isHidden,
  markdown,
}: {
  proposalId: string;
  status: string;
  isHidden: boolean;
  markdown: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const router = useRouter();

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Failed.");
      router.refresh();
    });
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-zinc-100 pt-3">
      {status === "pending" && (
        <>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => decideProposalAction(proposalId, "accepted"))}
            className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            Accept
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => decideProposalAction(proposalId, "rejected"))}
            className="rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 disabled:opacity-50"
          >
            Reject
          </button>
        </>
      )}
      {isHidden ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => unhideProposalAction(proposalId))}
          className="rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 disabled:opacity-50"
        >
          Unhide
        </button>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => withdrawProposalAction(proposalId))}
          className="rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 disabled:opacity-50"
        >
          Hide
        </button>
      )}
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(markdown);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        className="rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700"
      >
        {copied ? "Copied" : "Copy as markdown"}
      </button>
      {error && <span className="text-sm text-red-600">{error}</span>}
    </div>
  );
}
