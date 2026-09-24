"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import {
  toggleProposalUpvoteAction,
  withdrawProposalAction,
} from "@/server/actions/proposals";
import type { ProposedRight } from "@/lib/db/proposal-queries";

const STATUS_LABEL: Record<ProposedRight["status"], string | null> = {
  pending: null,
  accepted: "Accepted — going into the next version",
  rejected: "Not going forward",
  stale: "Written against an older draft",
  published: "Published",
};

export function ProposedRightCard({
  proposal,
  viewerSignerId,
}: {
  proposal: ProposedRight;
  viewerSignerId: string | null;
}) {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Endorsing needs a signature, not just an account; offer the way to sign.
  const [needsSignature, setNeedsSignature] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Optimistic so the count moves on click. The server action revalidates
  // /propose, which re-sorts the list — that reorder is the authoritative
  // result and will land a beat later.
  const [optimistic, setOptimistic] = useOptimistic({
    count: proposal.upvoteCount,
    mine: proposal.viewerHasUpvoted,
  });

  function handleEndorse() {
    setError(null);
    setNeedsSignature(false);
    // Undefined while Clerk loads — not the same as signed out.
    if (!isLoaded) return;
    if (!isSignedIn) {
      // Signed out says nothing about whether they have signed: sign-in first,
      // with create-account one click away in the modal.
      window.dispatchEvent(
        new CustomEvent("open-sign-modal", {
          detail: { mode: "comment-only", signIn: true },
        }),
      );
      return;
    }
    startTransition(async () => {
      setOptimistic({
        count: optimistic.count + (optimistic.mine ? -1 : 1),
        mine: !optimistic.mine,
      });
      const res = await toggleProposalUpvoteAction(proposal.id);
      if (!res.ok) {
        setError(res.error ?? "Couldn't record that.");
        if (res.code === "not_signer") setNeedsSignature(true);
      }
      router.refresh();
    });
  }

  function handleWithdraw() {
    setError(null);
    startTransition(async () => {
      const res = await withdrawProposalAction(proposal.id);
      if (!res.ok) setError(res.error ?? "Couldn't withdraw it.");
      router.refresh();
    });
  }

  const isMine = viewerSignerId !== null && viewerSignerId === proposal.proposerSignerId;
  const statusLabel = STATUS_LABEL[proposal.status];
  const longBody = proposal.body.length > 400;

  return (
    <article
      id={proposal.id}
      className="scroll-mt-24 rounded-lg border border-zinc-200 bg-white p-6"
    >
      <div className="flex items-start gap-5">
        {/* Endorse column */}
        <div className="flex shrink-0 flex-col items-center">
          <button
            type="button"
            onClick={handleEndorse}
            disabled={pending}
            aria-pressed={optimistic.mine}
            aria-label={optimistic.mine ? "Remove your endorsement" : "Endorse this proposed right"}
            className={`flex h-12 w-12 items-center justify-center rounded-full border text-lg transition-colors disabled:opacity-50 ${
              optimistic.mine
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-zinc-300 bg-white text-zinc-500 hover:border-blue-500 hover:text-blue-600"
            }`}
          >
            ▲
          </button>
          <span className="mt-1 font-mono text-sm font-semibold text-zinc-900">
            {optimistic.count}
          </span>
          <span className="text-[11px] uppercase tracking-wide text-zinc-400">
            {optimistic.count === 1 ? "signer" : "signers"}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="text-pretty text-xl font-semibold leading-snug text-zinc-950">
            {proposal.title}
          </h3>

          <p className="mt-1 text-sm text-zinc-500">
            Proposed by {proposal.proposerDisplayName}
            {proposal.proposerAffiliation ? ` · ${proposal.proposerAffiliation}` : ""}
          </p>

          {statusLabel && (
            <p
              className={`mt-3 inline-block rounded-full px-3 py-1 text-xs font-semibold ${
                proposal.status === "accepted" || proposal.status === "published"
                  ? "bg-emerald-100 text-emerald-900"
                  : "bg-zinc-100 text-zinc-600"
              }`}
            >
              {statusLabel}
            </p>
          )}

          <p
            className={`mt-4 text-pretty text-base leading-relaxed text-zinc-800 ${
              longBody && !expanded ? "line-clamp-5" : ""
            }`}
          >
            {proposal.body}
          </p>

          {proposal.pullQuote && (expanded || !longBody) && (
            <p className="mt-3 text-pretty text-base font-semibold italic leading-relaxed text-zinc-900">
              {proposal.pullQuote}
            </p>
          )}

          {longBody && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-2 text-sm font-medium text-blue-600 underline underline-offset-4"
            >
              {expanded ? "Show less" : "Read the whole thing"}
            </button>
          )}

          {proposal.rationale && expanded && (
            <div className="mt-5 rounded border-l-2 border-zinc-300 bg-zinc-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Why the existing eleven don&apos;t cover it
              </p>
              <p className="mt-2 text-pretty text-sm leading-relaxed text-zinc-700">
                {proposal.rationale}
              </p>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-zinc-500">
            <span>
              {proposal.commentCount}{" "}
              {proposal.commentCount === 1 ? "comment" : "comments"}
            </span>
            {isMine && proposal.status === "pending" && (
              <button
                type="button"
                onClick={handleWithdraw}
                disabled={pending}
                className="underline underline-offset-4 hover:text-zinc-800 disabled:opacity-50"
              >
                Withdraw
              </button>
            )}
          </div>

          {error && (
            <p className="mt-2 text-sm text-red-600">
              {error}
              {needsSignature && (
                <>
                  {" "}
                  <button
                    type="button"
                    onClick={() =>
                      window.dispatchEvent(
                        new CustomEvent("open-sign-modal", { detail: { mode: "sign" } }),
                      )
                    }
                    className="font-semibold underline underline-offset-4"
                  >
                    Sign the AI Bill of Rights
                  </button>
                </>
              )}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}
