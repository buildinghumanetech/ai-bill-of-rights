"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useLiveSigners } from "./LiveSignersProvider";

const HOLD_MS = 5000;

type Phase = "enter" | "hold" | "exit";

export default function LiveSignerBanner() {
  const { currentEvent, onEventFinished } = useLiveSigners();
  // Locking the rendered event prevents a mid-animation event swap from
  // visually glitching the banner. We only pick up the next event after
  // the current one fully exits.
  const [rendered, setRendered] = useState(currentEvent);
  const [phase, setPhase] = useState<Phase>("enter");

  // When a new currentEvent arrives and we have nothing rendered, accept it.
  useEffect(() => {
    if (rendered === null && currentEvent !== null) {
      setRendered(currentEvent);
      setPhase("enter");
    }
  }, [currentEvent, rendered]);

  // Drive the enter → hold → exit timeline.
  useEffect(() => {
    if (rendered === null) return;
    if (phase === "enter") {
      const t = setTimeout(() => setPhase("hold"), 240);
      return () => clearTimeout(t);
    }
    if (phase === "hold") {
      const t = setTimeout(() => setPhase("exit"), HOLD_MS);
      return () => clearTimeout(t);
    }
    if (phase === "exit") {
      const t = setTimeout(() => {
        setRendered(null);
        setPhase("enter"); // reset for next event
        onEventFinished();
      }, 240);
      return () => clearTimeout(t);
    }
  }, [phase, rendered, onEventFinished]);

  if (rendered === null) return null;

  // Translation/opacity per phase.
  const transform =
    phase === "enter" || phase === "exit"
      ? "translateY(-16px)"
      : "translateY(0)";
  const opacity = phase === "enter" || phase === "exit" ? 0 : 1;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-6 z-50 flex justify-center px-4"
      aria-live="polite"
      role="status"
    >
      <Link
        href={`/signatories/${rendered.id}`}
        // Trigger exit early; the timeline effect cancels the in-flight enter/hold timer on re-run.
        onClick={() => setPhase("exit")}
        className="glass-banner pointer-events-auto inline-flex max-w-[90vw] items-center gap-2 overflow-hidden text-ellipsis whitespace-nowrap rounded-full border border-zinc-900/5 bg-white/70 px-4 py-2 text-sm text-zinc-800 shadow-lg shadow-zinc-900/10 backdrop-blur-md backdrop-saturate-150 hover:scale-[1.02]"
        style={{
          transform,
          opacity,
          transition:
            "opacity 240ms ease, transform 240ms ease, scale 200ms ease",
        }}
      >
        <strong className="font-semibold text-blue-600">
          {rendered.displayName}
        </strong>
        {rendered.locationText ? (
          <span className="text-zinc-600">
            from {rendered.locationText} just signed
          </span>
        ) : (
          <span className="text-zinc-600">just signed</span>
        )}
        <span className="ml-1 text-zinc-400" aria-hidden="true">→</span>
      </Link>
    </div>
  );
}
