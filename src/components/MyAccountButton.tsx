"use client";

import Link from "next/link";
import { useAuth } from "@clerk/nextjs";

/**
 * Floating "My Account" pill in the top-right of every page when the
 * viewer is signed in via Clerk. Hidden for anonymous visitors.
 */
export function MyAccountButton() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded || !isSignedIn) return null;

  return (
    <Link
      href="/account"
      className="fixed right-4 top-4 z-40 inline-flex items-center gap-1.5 rounded-full bg-white/85 px-4 py-2 text-xs font-semibold text-zinc-800 shadow-md ring-1 ring-zinc-200 backdrop-blur-md backdrop-saturate-150 transition-colors hover:bg-white hover:text-zinc-950"
    >
      <svg
        className="h-3.5 w-3.5"
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden
      >
        <path
          d="M8 8a3 3 0 100-6 3 3 0 000 6zM2 14a6 6 0 1112 0H2z"
          fill="currentColor"
        />
      </svg>
      My Account
    </Link>
  );
}
