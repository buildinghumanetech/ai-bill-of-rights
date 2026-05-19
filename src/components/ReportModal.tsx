"use client";

import { useRef } from "react";
import { submitReportAction } from "@/server/actions/reports";

interface Props {
  commentId: string;
  versionString: string;
}

export function ReportModal({ commentId, versionString }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="text-zinc-500 underline-offset-4 hover:underline"
      >
        Report
      </button>
      <dialog ref={dialogRef} className="rounded-lg p-6 backdrop:bg-black/40">
        <form action={submitReportAction} className="flex w-80 flex-col gap-3">
          <h3 className="text-base font-semibold">Report comment</h3>
          <input type="hidden" name="commentId" value={commentId} />
          <input type="hidden" name="versionString" value={versionString} />
          <label className="text-xs">
            Why? (optional)
            <input
              name="reason"
              type="text"
              maxLength={200}
              className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            />
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="rounded-full px-3 py-1 text-xs text-zinc-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-full bg-red-700 px-3 py-1 text-xs font-medium text-white"
            >
              Submit report
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
