"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  approveSelfieAction,
  rejectSelfieAction,
  resolveSelfieReportsAction,
} from "@/server/actions/selfie";
import {
  REJECTION_REASONS,
  rejectionReasonToText,
  type RejectionReason,
} from "@/lib/selfie/policy";

export interface AdminSelfieClientRow {
  id: string;
  signerId: string;
  displayBlobUrl: string;
  submittedAt: string;
  reviewedAt: string | null;
  captureMethod: string;
  rejectionReason: RejectionReason | null;
  autoHiddenAt: string | null;
  signer: {
    displayName: string;
    affiliation: string | null;
    locationText: string | null;
    verificationMethod: string;
    memberSince: string;
  };
}

type Tab = "pending" | "auto_hidden" | "rejected" | "approved";

interface Props {
  rows: AdminSelfieClientRow[];
  currentTab: Tab;
  counts: { pending: number; auto_hidden: number };
}

const TABS: { id: Tab; label: string }[] = [
  { id: "pending", label: "Pending" },
  { id: "auto_hidden", label: "Auto-hidden" },
  { id: "rejected", label: "Rejected" },
  { id: "approved", label: "Approved" },
];

export default function AdminSelfiesClient({
  rows,
  currentTab,
  counts,
}: Props) {
  return (
    <div>
      <nav className="mb-6 flex gap-2 border-b border-zinc-200">
        {TABS.map((t) => {
          const active = currentTab === t.id;
          const count =
            t.id === "pending" ? counts.pending
            : t.id === "auto_hidden" ? counts.auto_hidden
            : null;
          return (
            <Link
              key={t.id}
              href={`/admin/selfies?tab=${t.id}`}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium ${
                active
                  ? "border-b-2 border-zinc-900 text-zinc-900"
                  : "text-zinc-500 hover:text-zinc-800"
              }`}
            >
              {t.label}
              {count !== null && count > 0 ? (
                <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-700">
                  {count}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-zinc-200 bg-zinc-50 p-12 text-center text-zinc-600">
          Nothing here right now.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {rows.map((row) => (
            <ReviewCard key={row.id} row={row} tab={currentTab} />
          ))}
        </div>
      )}
    </div>
  );
}

function ReviewCard({ row, tab }: { row: AdminSelfieClientRow; tab: Tab }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [showReject, setShowReject] = useState(false);
  const [reason, setReason] = useState<RejectionReason>("not_a_face");
  const [note, setNote] = useState("");

  function doApprove() {
    start(async () => {
      await approveSelfieAction(row.id);
      router.refresh();
    });
  }
  function doReject() {
    start(async () => {
      await rejectSelfieAction(row.id, reason, note || undefined);
      router.refresh();
    });
  }
  function doRestore() {
    start(async () => {
      await resolveSelfieReportsAction(row.id, "allowed");
      router.refresh();
    });
  }
  function doHideFromReports() {
    start(async () => {
      await resolveSelfieReportsAction(row.id, "hidden");
      router.refresh();
    });
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={row.displayBlobUrl}
        alt={`${row.signer.displayName} selfie`}
        className="aspect-square w-full bg-zinc-100 object-cover"
      />
      <div className="p-4">
        <div className="flex items-baseline justify-between gap-3">
          <Link
            href={`/signatories/${row.signerId}`}
            target="_blank"
            className="text-base font-semibold text-zinc-950 hover:underline"
          >
            {row.signer.displayName}
          </Link>
          <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">
            {row.captureMethod === "live" ? "Live" : "Upload"}
          </span>
        </div>
        {row.signer.affiliation || row.signer.locationText ? (
          <p className="mt-1 text-xs text-zinc-600">
            {[row.signer.affiliation, row.signer.locationText]
              .filter(Boolean)
              .join(" · ")}
          </p>
        ) : null}
        <p className="mt-1 text-[11px] text-zinc-400">
          Submitted {row.submittedAt.slice(0, 10)} · Member since{" "}
          {row.signer.memberSince.slice(0, 10)} · {row.signer.verificationMethod}
        </p>
        {row.rejectionReason ? (
          <p className="mt-2 text-xs text-red-700">
            Reason: {rejectionReasonToText(row.rejectionReason)}
          </p>
        ) : null}

        {tab === "pending" ? (
          showReject ? (
            <div className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 p-3">
              <label className="block text-xs">
                <span className="font-medium text-zinc-700">Reason</span>
                <select
                  value={reason}
                  onChange={(e) =>
                    setReason(e.target.value as RejectionReason)
                  }
                  className="mt-1 w-full rounded border border-zinc-300 px-2 py-1 text-xs"
                >
                  {REJECTION_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {rejectionReasonToText(r)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="mt-2 block text-xs">
                <span className="font-medium text-zinc-700">
                  Note (private)
                </span>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="mt-1 w-full rounded border border-zinc-300 px-2 py-1 text-xs"
                />
              </label>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={doReject}
                  className="rounded-full bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  Confirm reject
                </button>
                <button
                  type="button"
                  onClick={() => setShowReject(false)}
                  className="text-xs text-zinc-600 hover:underline"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={doApprove}
                className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                Approve
              </button>
              <button
                type="button"
                onClick={() => setShowReject(true)}
                className="rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-200 hover:bg-red-100"
              >
                Reject
              </button>
            </div>
          )
        ) : null}

        {tab === "auto_hidden" ? (
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={doRestore}
              className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              Restore
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={doHideFromReports}
              className="rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-200 hover:bg-red-100"
            >
              Hide (reject)
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
