"use client";

import Link from "next/link";
import { useState } from "react";
import SignModal from "./SignModal";
import SignatureCount from "./SignatureCount";

const buttonClasses =
  "glass-button pointer-events-auto rounded-full bg-gradient-to-b from-blue-500/85 to-blue-700/85 px-8 py-3.5 text-sm font-semibold text-white backdrop-blur-md backdrop-saturate-150 transition-transform hover:scale-[1.03] sm:px-10 sm:py-4 sm:text-base";

export default function FloatingSignButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={buttonClasses}
        >
          Sign the{" "}
          <span className="block sm:inline">AI Bill of Rights</span>
        </button>

        <p className="pointer-events-auto rounded-full bg-white/70 px-4 py-1 text-center text-xs text-zinc-700 backdrop-blur-md backdrop-saturate-150">
          Join{" "}
          <Link
            href="/signers"
            className="font-bold text-blue-600 hover:underline"
          >
            <SignatureCount /> others
          </Link>{" "}
          who have already signed
        </p>
      </div>

      <SignModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
