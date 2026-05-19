"use client";

import { FormEvent, useEffect, useState, useTransition } from "react";
import { editSignerAction } from "@/server/actions/admin";

interface Props {
  open: boolean;
  onClose: () => void;
  signerId: string;
  initialDisplayName: string;
  initialAffiliation: string | null;
  initialLocationText: string | null;
}

export default function AdminEditSignerModal({
  open,
  onClose,
  signerId,
  initialDisplayName,
  initialAffiliation,
  initialLocationText,
}: Props) {
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [affiliation, setAffiliation] = useState(initialAffiliation ?? "");
  const [locationText, setLocationText] = useState(initialLocationText ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (open) {
      setDisplayName(initialDisplayName);
      setAffiliation(initialAffiliation ?? "");
      setLocationText(initialLocationText ?? "");
      setError(null);
    }
  }, [open, initialDisplayName, initialAffiliation, initialLocationText]);

  if (!open) return null;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await editSignerAction({
        signerId,
        displayName,
        affiliation,
        locationText,
      });
      if (!res.success) {
        setError(res.error ?? "Couldn't save changes.");
        return;
      }
      onClose();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/60 px-4"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
      >
        <h2 className="text-lg font-semibold text-zinc-950">Edit signer</h2>

        <label className="mt-5 block">
          <span className="text-xs font-medium text-zinc-700">
            Display name <span className="text-red-600">*</span>
          </span>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-950 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </label>

        <label className="mt-4 block">
          <span className="text-xs font-medium text-zinc-700">Affiliation</span>
          <input
            type="text"
            value={affiliation}
            onChange={(e) => setAffiliation(e.target.value)}
            placeholder="(optional)"
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-950 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </label>

        <label className="mt-4 block">
          <span className="text-xs font-medium text-zinc-700">Location</span>
          <input
            type="text"
            value={locationText}
            onChange={(e) => setLocationText(e.target.value)}
            placeholder="(optional)"
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-950 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </label>

        {error ? (
          <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 ring-1 ring-inset ring-red-600/20">
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
