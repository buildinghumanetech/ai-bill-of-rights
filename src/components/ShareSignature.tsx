"use client";

import { useState } from "react";
import { signerShareUrl } from "@/lib/share/urls";

interface Props {
  /** The signer this box belongs to. Owner-only UI — never render it to a visitor. */
  signerId: string;
  /** Absolute origin, e.g. https://ai-for-people.org */
  siteUrl: string;
}

/**
 * "Share your signature" — shown only to the signer who owns the page. Every
 * link is built with `signerShareUrl` so `?ref=`/`?via=` attribution rides
 * along and we can tell which channel actually converts.
 */
export function ShareSignature({ signerId, siteUrl }: Props) {
  const [copied, setCopied] = useState(false);

  const copyUrl = signerShareUrl(siteUrl, signerId, "copy");
  const shareText = `I signed the AI Bill of Rights — nine commitments we're demanding from every AI company. Add your name.`;
  const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
    `${shareText} ${signerShareUrl(siteUrl, signerId, "x")}`,
  )}`;
  const linkedInUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(
    signerShareUrl(siteUrl, signerId, "linkedin"),
  )}`;
  const emailUrl = `mailto:?subject=${encodeURIComponent(
    "I signed the AI Bill of Rights",
  )}&body=${encodeURIComponent(
    `${shareText}\n\n${signerShareUrl(siteUrl, signerId, "email")}`,
  )}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(copyUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="mt-10 rounded-2xl border border-zinc-200 p-6">
      <h2 className="text-sm font-semibold tracking-tight text-zinc-950">
        Share your signature
      </h2>
      <p className="mt-1 text-xs text-zinc-600">
        The people you invite are the ones most likely to sign.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <input
          type="text"
          readOnly
          value={copyUrl}
          onFocus={(e) => e.currentTarget.select()}
          className="flex-1 min-w-0 rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-xs text-zinc-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        />
        <button
          type="button"
          onClick={copyLink}
          className="shrink-0 rounded-md bg-zinc-900 px-3 py-2 text-xs font-medium text-white hover:bg-zinc-700"
        >
          {copied ? "Copied!" : "Copy link"}
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <a
          href={tweetUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
        >
          <svg
            className="h-3.5 w-3.5"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden
          >
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
          Share on X
        </a>
        <a
          href={linkedInUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
        >
          <svg
            className="h-3.5 w-3.5"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden
          >
            <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.063 2.063 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
          </svg>
          Share on LinkedIn
        </a>
        <a
          href={emailUrl}
          className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
        >
          <svg
            className="h-3.5 w-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
          >
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="m2 7 10 6 10-6" />
          </svg>
          Share by email
        </a>
      </div>
    </section>
  );
}
