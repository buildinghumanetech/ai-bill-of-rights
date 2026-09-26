"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type State = "working" | "done" | "invalid" | "error";

/**
 * Unsubscribes as the page loads, so the link in the email is one click, then
 * confirms. The POST happens here rather than on the GET of the page so the
 * link scanners many inboxes run don't unsubscribe people by fetching it.
 *
 * Colors stay in the site palette: zinc-950 (#09090b), zinc-500 (#71717a) and
 * blue (#2563eb). No green or purple.
 */
export function UnsubscribeConfirm({
  token,
  initial,
}: {
  token: string;
  initial: State;
}) {
  const [state, setState] = useState<State>(initial);

  useEffect(() => {
    if (initial !== "working") return;
    let cancelled = false;
    fetch(`/api/unsubscribe/${encodeURIComponent(token)}`, { method: "POST" })
      .then((res) => {
        if (cancelled) return;
        setState(res.ok ? "done" : res.status === 404 ? "invalid" : "error");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [initial, token]);

  if (state === "done") {
    return (
      <div role="status">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">
          You&apos;re unsubscribed.
        </h1>
        <p className="mt-3 text-zinc-950">
          You won&apos;t get any more emails about new versions of The
          People&apos;s AI Bill of Rights. Your signature isn&apos;t affected.
        </p>
        <p className="mt-6">
          <Link href="/" className="text-sm text-zinc-500 underline underline-offset-4 hover:text-zinc-950">
            Go to The People&apos;s AI Bill of Rights
          </Link>
        </p>
      </div>
    );
  }

  if (state === "invalid") {
    return (
      <div role="alert">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">
          This link isn&apos;t valid.
        </h1>
        <p className="mt-3 text-zinc-950">
          To stop these emails, reply to any of them and we&apos;ll take you
          off the list.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">
        {state === "error" ? "Something went wrong." : "Unsubscribing…"}
      </h1>
      {state === "error" ? (
        <p className="mt-3 text-zinc-950">Please try again.</p>
      ) : null}
      {/* Without JavaScript (or after an error), one button does the same. */}
      <form
        method="post"
        action={`/api/unsubscribe/${encodeURIComponent(token)}`}
        className="mt-6"
      >
        <button
          type="submit"
          className="rounded-full bg-[#2563eb] px-6 py-3 text-base font-semibold text-white hover:opacity-90"
        >
          Unsubscribe
        </button>
      </form>
    </div>
  );
}
