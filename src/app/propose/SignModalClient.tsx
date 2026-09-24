"use client";

import { useEffect, useState } from "react";
import SignModal from "@/app/SignModal";

/**
 * Listens for the `open-sign-modal` event that ProposeRightForm and
 * ProposedRightCard dispatch, and drives <SignModal>'s controlled `open` prop.
 * TabbedDocument does this for / and /proposed; /propose needs its own.
 */
export default function SignModalClient() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"sign" | "comment-only">("comment-only");
  const [signIn, setSignIn] = useState(false);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (
        e as CustomEvent<{ mode?: "sign" | "comment-only"; signIn?: boolean } | undefined>
      ).detail;
      setMode(detail?.mode ?? "comment-only");
      setSignIn(Boolean(detail?.signIn));
      setOpen(true);
    };
    window.addEventListener("open-sign-modal", onOpen);
    return () => window.removeEventListener("open-sign-modal", onOpen);
  }, []);

  return (
    <SignModal
      open={open}
      onClose={() => setOpen(false)}
      mode={mode}
      startInSignIn={signIn}
    />
  );
}
