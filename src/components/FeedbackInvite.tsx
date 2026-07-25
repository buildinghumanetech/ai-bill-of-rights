"use client";

import { commentCountLabel } from "@/lib/comments/count";

interface Props {
  variant: "current" | "proposed";
  currentVersion: string;
  proposedVersion: string;
  commentCount: number;
  /** Switches the document to the Proposed tab (where feedback happens). */
  onOpenDraft: () => void;
}

const STEPS = [
  {
    title: "Select any text",
    detail: "Drag across a sentence — on a phone, press and hold.",
  },
  {
    title: "Say what you'd change",
    detail: "Ask a question, object, or write the wording you'd prefer.",
  },
  {
    title: "Add your email to post",
    detail: "One step, so comments come from real people.",
  },
];

/**
 * The "you can change this" banner that sits directly above the document tabs.
 *
 * Feedback here happens by highlighting text inside the Proposed draft, which
 * is close to invisible if nobody tells you: readers were treating the document
 * as finished and assuming their only options were to sign or not. This states
 * the mechanism in plain language on both tabs — an invitation with a button on
 * Current, the three concrete steps on Proposed.
 */
export function FeedbackInvite({
  variant,
  currentVersion,
  proposedVersion,
  commentCount,
  onOpenDraft,
}: Props) {
  if (variant === "current") {
    return (
      <section className="mb-6 rounded-xl border border-blue-200 bg-blue-50/60 px-5 py-5 sm:px-7 sm:py-6">
        <h2 className="text-lg font-semibold tracking-tight text-zinc-950 sm:text-xl">
          This is a living document — you can change it.
        </h2>
        <p className="mt-2 max-w-3xl text-pretty text-sm leading-relaxed text-zinc-700 sm:text-base">
          You&apos;re reading v{currentVersion}, the version people are signing.
          v{proposedVersion} is the open draft, and anyone can mark it up:
          highlight a line, then leave a comment or suggest different wording.
          Comments are public and can be voted up or down, and the ones that
          hold up get folded into the next version. Disagreeing with a line is a
          reason to say so here — not a reason to walk away.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
          <button
            type="button"
            onClick={onOpenDraft}
            className="rounded-full bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
          >
            Give feedback on the v{proposedVersion} draft →
          </button>
          <button
            type="button"
            onClick={onOpenDraft}
            className="text-sm text-zinc-600 underline underline-offset-4 hover:text-blue-700"
          >
            {commentCount > 0
              ? `Read the ${commentCountLabel(commentCount)} already on the draft`
              : "Be the first to comment on the draft"}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="mb-6 rounded-xl border border-blue-200 bg-blue-50/60 px-5 py-5 sm:px-7 sm:py-6">
      <h2 className="text-lg font-semibold tracking-tight text-zinc-950 sm:text-xl">
        You&apos;re in the draft — this is where feedback happens.
      </h2>
      <p className="mt-2 max-w-3xl text-pretty text-sm leading-relaxed text-zinc-700 sm:text-base">
        Nothing on this tab is final. v{proposedVersion} is being written in the
        open, and{" "}
        {commentCount > 0
          ? `${commentCountLabel(commentCount)} so far have shaped it.`
          : "no one has commented yet."}
      </p>
      <ol className="mt-5 grid gap-3 sm:grid-cols-3 sm:gap-5">
        {STEPS.map((step, i) => (
          <li key={step.title} className="flex gap-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 font-mono text-xs font-semibold text-white">
              {i + 1}
            </span>
            <span>
              <span className="block text-sm font-semibold text-zinc-900">
                {step.title}
              </span>
              <span className="mt-0.5 block text-xs leading-relaxed text-zinc-600">
                {step.detail}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
