"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { reaffirmMySignature } from "@/server/actions/me";
import { useOptionalLiveSigners } from "@/app/LiveSignersProvider";

/**
 * The only on-site way to add your name to a newer version. Rendered by
 * /v/<version> only for someone who signed an earlier version, and only when
 * this version is the current one. Quiet on purpose: their earlier signature
 * stands, so this is an invitation after reading, not a prompt.
 */
export function AddMyNameButton({ version }: { version: string }) {
  const router = useRouter();
  const liveSigners = useOptionalLiveSigners();
  const [state, setState] = useState<"idle" | "pending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setState("pending");
    setError(null);
    try {
      const res = await reaffirmMySignature(version);
      if (!res.success) {
        setError(res.error ?? "We couldn't add your name.");
        setState("idle");
        return;
      }
      setState("done");
      // Drop the "v0.1.0 is out" line everywhere at once; the refresh brings
      // the server's answer in behind it.
      const viewer = liveSigners?.viewer;
      if (viewer) liveSigners.setViewer({ ...viewer, newVersion: null });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't add your name.");
      setState("idle");
    }
  }

  if (state === "done") {
    return (
      <p className="text-sm text-zinc-600" role="status">
        Your name is on v{version}.
      </p>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={state === "pending"}
        className="text-sm font-medium text-zinc-600 underline underline-offset-4 transition-colors hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {state === "pending" ? "Adding your name…" : `Add my name to v${version}`}
      </button>
      {error ? (
        <p className="mt-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
