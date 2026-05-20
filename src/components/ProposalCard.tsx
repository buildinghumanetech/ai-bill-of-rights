"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ProposalRow } from "@/lib/db/queries";
import {
  acceptProposalAction,
  rejectProposalAction,
  toggleProposalUpvoteAction,
} from "@/server/actions/proposals";

interface Props {
  proposal: ProposalRow;
  originalText?: string;
  isAdmin: boolean;
}

const KIND_LABEL: Record<ProposalRow["kind"], string> = {
  replace: "Replace",
  insert_after: "Insert after",
  delete: "Delete",
};

const STATUS_BADGE: Record<ProposalRow["status"], { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-amber-50 text-amber-700 border-amber-200" },
  accepted: {
    label: "Accepted",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  rejected: { label: "Rejected", className: "bg-red-50 text-red-700 border-red-200" },
  stale: { label: "Stale", className: "bg-zinc-100 text-zinc-500 border-zinc-200" },
  published: {
    label: "Published",
    className: "bg-blue-50 text-blue-700 border-blue-200",
  },
};

export function ProposalCard({ proposal, originalText, isAdmin }: Props) {
  const router = useRouter();
  const [actionPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const badge = STATUS_BADGE[proposal.status];

  function handleUpvote() {
    startTransition(async () => {
      const res = await toggleProposalUpvoteAction(proposal.id);
      if (!res.ok) setError(res.error ?? "Couldn't upvote.");
      else router.refresh();
    });
  }

  function handleAccept() {
    startTransition(async () => {
      const res = await acceptProposalAction(proposal.id);
      if (!res.ok) setError(res.error ?? "Couldn't accept.");
      else router.refresh();
    });
  }

  function handleReject() {
    startTransition(async () => {
      const res = await rejectProposalAction(proposal.id);
      if (!res.ok) setError(res.error ?? "Couldn't reject.");
      else router.refresh();
    });
  }

  return (
    <div className="rounded-md border border-zinc-200 bg-white p-3 text-sm space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-zinc-500">
            {KIND_LABEL[proposal.kind]}
          </span>
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${badge.className}`}
          >
            {badge.label}
          </span>
        </div>
        <span className="text-xs text-zinc-400">
          {proposal.displayName} ·{" "}
          {new Date(proposal.createdAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          })}
        </span>
      </div>

      {/* Diff view */}
      {proposal.kind === "replace" && originalText && (
        <div className="rounded bg-red-50 border border-red-100 px-2 py-1.5 text-xs text-red-800 line-through opacity-75">
          {originalText}
        </div>
      )}
      {proposal.kind !== "delete" && proposal.newText && (
        <div
          className={`rounded px-2 py-1.5 text-xs ${
            proposal.kind === "replace"
              ? "bg-emerald-50 border border-emerald-100 text-emerald-900"
              : "bg-blue-50 border border-blue-100 text-blue-900"
          }`}
        >
          {proposal.kind === "insert_after" && (
            <span className="text-[9px] font-medium uppercase tracking-widest text-blue-500 block mb-0.5">
              Insert after →
            </span>
          )}
          {proposal.newText}
        </div>
      )}
      {proposal.kind === "delete" && (
        <div className="rounded bg-red-50 border border-red-100 px-2 py-1.5 text-xs text-red-800">
          This sentence would be removed.
        </div>
      )}

      {/* Rationale */}
      {proposal.rationale && (
        <p className="text-xs text-zinc-600 italic border-l-2 border-zinc-200 pl-2">
          {proposal.rationale}
        </p>
      )}

      {error && (
        <p className="rounded bg-red-50 px-2 py-1 text-xs text-red-700">{error}</p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1 flex-wrap">
        <button
          type="button"
          onClick={handleUpvote}
          disabled={actionPending}
          className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-900 disabled:opacity-40"
        >
          👍 {proposal.upvoteCount > 0 ? proposal.upvoteCount : ""}
          <span>{proposal.upvoteCount === 1 ? "upvote" : "upvotes"}</span>
        </button>

        {isAdmin && proposal.status === "pending" && (
          <>
            <button
              type="button"
              onClick={handleAccept}
              disabled={actionPending}
              className="ml-auto rounded px-2 py-0.5 text-xs font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-40"
            >
              Accept
            </button>
            <button
              type="button"
              onClick={handleReject}
              disabled={actionPending}
              className="rounded px-2 py-0.5 text-xs font-medium bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-40"
            >
              Reject
            </button>
          </>
        )}
      </div>
    </div>
  );
}
