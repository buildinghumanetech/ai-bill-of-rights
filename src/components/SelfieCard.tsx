"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SelfieCapture } from "./SelfieCapture";
import { SelfieStatusBadge } from "./SelfieStatusBadge";
import { removeMySelfieAction } from "@/server/actions/selfie";
import type { RejectionReason } from "@/lib/selfie/policy";

export interface SelfieCardData {
  status: "none" | "pending" | "approved" | "rejected" | "auto_hidden";
  thumbnailUrl?: string | null;
  rejectionReason?: RejectionReason | null;
  submittedAt?: string | null;
  reviewedAt?: string | null;
}

export function SelfieCard({ initial }: { initial: SelfieCardData }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [showReplaceFlow, setShowReplaceFlow] = useState(false);

  async function handleRemove() {
    const ok = window.confirm(
      "Remove your photo from your public profile? You can upload a new one anytime.",
    );
    if (!ok) return;
    start(async () => {
      await removeMySelfieAction();
      router.refresh();
    });
  }

  if (initial.status === "none") {
    return (
      <section className="mt-8">
        <h2 className="text-xl font-semibold text-zinc-950">Your photo</h2>
        <p className="mt-2 text-sm text-zinc-600">
          Put a face to your name on your signer profile.
        </p>
        <div className="mt-4">
          <SelfieCapture context="account" />
        </div>
      </section>
    );
  }

  return (
    <section className="mt-8 rounded-2xl border border-zinc-200 bg-white p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        {initial.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={initial.thumbnailUrl}
            alt="Your photo"
            className="h-24 w-24 shrink-0 rounded-2xl bg-zinc-100 object-cover"
          />
        ) : (
          <div className="h-24 w-24 shrink-0 rounded-2xl bg-zinc-100" />
        )}
        <div className="flex-1">
          <h2 className="text-xl font-semibold text-zinc-950">Your photo</h2>
          <div className="mt-2">
            <SelfieStatusBadge
              status={initial.status}
              rejectionReason={initial.rejectionReason ?? null}
            />
          </div>
          {initial.submittedAt ? (
            <p className="mt-2 text-xs text-zinc-500">
              Submitted {initial.submittedAt.slice(0, 10)}
              {initial.reviewedAt
                ? ` · Reviewed ${initial.reviewedAt.slice(0, 10)}`
                : ""}
            </p>
          ) : null}
        </div>
      </div>

      {initial.status === "approved" ? (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setShowReplaceFlow((v) => !v)}
            className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
          >
            {showReplaceFlow ? "Cancel" : "Replace photo"}
          </button>
          <button
            type="button"
            onClick={handleRemove}
            disabled={pending}
            className="text-sm text-red-700 underline-offset-4 hover:underline disabled:opacity-50"
          >
            {pending ? "Removing…" : "Remove photo"}
          </button>
        </div>
      ) : null}

      {initial.status === "approved" && showReplaceFlow ? (
        <div className="mt-4">
          <SelfieCapture context="account" />
        </div>
      ) : null}

      {initial.status === "rejected" || initial.status === "auto_hidden" ? (
        <div className="mt-5">
          <p className="mb-3 text-sm text-zinc-600">
            {initial.status === "rejected"
              ? "Try again with a different photo."
              : "Submit a new photo to replace the hidden one."}
          </p>
          <SelfieCapture context="account" />
        </div>
      ) : null}

      {initial.status === "pending" ? (
        <p className="mt-5 text-sm text-zinc-600">
          We&apos;ll email you when an admin has reviewed your photo. Usually
          within 24 hours.
        </p>
      ) : null}
    </section>
  );
}
