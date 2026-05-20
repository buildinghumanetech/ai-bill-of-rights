"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { toggleEndorsementAction } from "@/server/actions/endorsements";

interface Props {
  baseVersionId: string;
  initialEndorsed: boolean;
  endorserCount: number;
}

export function EndorseButton({ baseVersionId, initialEndorsed, endorserCount }: Props) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const { isSignedIn } = useAuth();

  function handleClick() {
    if (!isSignedIn) {
      window.dispatchEvent(new CustomEvent("open-sign-modal"));
      return;
    }
    start(async () => {
      await toggleEndorsementAction(baseVersionId);
      router.refresh();
    });
  }

  return (
    <div className="inline-flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className={`rounded-full px-5 py-2 text-sm font-semibold shadow transition-colors disabled:opacity-50 ${
          initialEndorsed
            ? "bg-emerald-600 text-white hover:bg-emerald-700"
            : "bg-zinc-900 text-white hover:bg-zinc-700"
        }`}
      >
        {initialEndorsed ? "✓ Endorsing this direction" : "Endorse this direction"}
      </button>
      <p className="text-xs text-zinc-500">
        {endorserCount} {endorserCount === 1 ? "person endorses" : "people endorse"} this draft
      </p>
    </div>
  );
}
