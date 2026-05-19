"use client";

import { ReactNode, useState } from "react";
import SignModal from "./SignModal";

interface Props {
  children: ReactNode;
  className?: string;
}

/**
 * A reusable click target that opens the SignModal. Use anywhere a "sign this
 * document" CTA is needed — empty states, inline links, additional buttons —
 * to share modal state without re-implementing the trigger logic.
 */
export default function SignTrigger({ children, className }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className}
      >
        {children}
      </button>
      <SignModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
