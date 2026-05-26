"use client";

import { useTransition } from "react";
import { deleteAttestationAction } from "@/server/actions/admin";

interface Props {
  attestationId: string;
  orgName: string;
}

export default function DeleteAttestationButton({ attestationId, orgName }: Props) {
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    const confirmed = window.confirm(
      `Delete attestation from "${orgName}"? This is permanent and cannot be undone.`,
    );
    if (!confirmed) return;
    startTransition(async () => {
      await deleteAttestationAction(attestationId);
    });
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={pending}
      className="rounded-md bg-red-50 px-3 py-1 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-600/20 transition-colors hover:bg-red-100 disabled:opacity-50"
    >
      {pending ? "Deleting\u2026" : "Delete"}
    </button>
  );
}
