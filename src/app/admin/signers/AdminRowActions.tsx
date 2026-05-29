"use client";

import { useState, useTransition } from "react";
import {
  deleteSignerAction,
  setAdminFlagAction,
} from "@/server/actions/admin";
import AdminEditSignerModal from "./AdminEditSignerModal";

interface Props {
  signerId: string;
  displayName: string;
  affiliation: string | null;
  locationText: string | null;
  isAdmin: boolean;
}

export default function AdminRowActions({
  signerId,
  displayName,
  affiliation,
  locationText,
  isAdmin,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [editOpen, setEditOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleDelete() {
    const confirmed = window.confirm(
      `Anonymize ${displayName}? This scrubs their private data (contact info, location, any photo) and renames them to "Anonymized signer #N". Their signature and the public count are kept.`,
    );
    if (!confirmed) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteSignerAction(signerId);
      if (!result.success) {
        setError(result.error ?? "Couldn't anonymize this signer.");
      }
    });
  }

  function handleToggleAdmin() {
    setError(null);
    startTransition(async () => {
      const result = await setAdminFlagAction(signerId, !isAdmin);
      if (!result.success) {
        setError(result.error ?? "Couldn't update admin role.");
      }
    });
  }

  return (
    <>
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setEditOpen(true)}
          disabled={pending}
          className="rounded-md bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-600/20 transition-colors hover:bg-blue-100 disabled:opacity-50"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={handleToggleAdmin}
          disabled={pending}
          className={`rounded-md px-3 py-1 text-xs font-medium ring-1 ring-inset transition-colors disabled:opacity-50 ${
            isAdmin
              ? "bg-amber-50 text-amber-700 ring-amber-600/20 hover:bg-amber-100"
              : "bg-zinc-50 text-zinc-700 ring-zinc-300 hover:bg-zinc-100"
          }`}
        >
          {pending ? "…" : isAdmin ? "Revoke admin" : "Make admin"}
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={pending}
          className="rounded-md bg-red-50 px-3 py-1 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-600/20 transition-colors hover:bg-red-100 disabled:opacity-50"
        >
          Delete
        </button>
      </div>
      {error ? (
        <p className="mt-1 text-right text-xs text-red-700">{error}</p>
      ) : null}
      <AdminEditSignerModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        signerId={signerId}
        initialDisplayName={displayName}
        initialAffiliation={affiliation}
        initialLocationText={locationText}
      />
    </>
  );
}
