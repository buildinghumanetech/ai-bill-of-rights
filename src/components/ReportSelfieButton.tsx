"use client";

import { useState, useTransition } from "react";
import { reportSelfieAction } from "@/server/actions/selfie";

export function ReportSelfieButton({ selfieId }: { selfieId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  if (done) {
    return (
      <p className="mt-6 text-xs text-zinc-500">
        Thanks — we&apos;ll review this photo.
      </p>
    );
  }

  return (
    <div className="mt-6">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs text-zinc-500 underline-offset-4 hover:text-zinc-700 hover:underline"
      >
        Report this photo
      </button>
      {open ? (
        <div className="mt-3 rounded-xl border border-zinc-200 bg-white p-4">
          <label className="block">
            <span className="text-xs font-medium text-zinc-700">
              Why are you reporting it? (optional)
            </span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/20"
            />
          </label>
          <div className="mt-3 flex gap-3">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  try {
                    await reportSelfieAction(selfieId, reason || undefined);
                    setDone(true);
                  } catch (err) {
                    console.error(err);
                    setDone(true); // still claim "thanks" — don't expose internals
                  }
                })
              }
              className="rounded-full bg-zinc-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
            >
              {pending ? "Sending…" : "Submit report"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs text-zinc-600 hover:underline"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
