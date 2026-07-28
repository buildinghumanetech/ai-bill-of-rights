import Link from "next/link";

/**
 * ============================================================================
 * THE SIGNATURE-COUNT THRESHOLD — the one number to tune in this file.
 * ============================================================================
 *
 * A raw signature count is only social proof once it is big. Below that, a
 * bare number is *counter*-proof: "90 people signed" tells a visitor the
 * campaign is tiny and safe to skip. So the framing has to flip:
 *
 *   count <  RAW_COUNT_THRESHOLD  →  "early" mode.
 *       The count is presented as progress toward a cohort goal, and the
 *       visitor is given their own ordinal ("you'd be signer #91"). Being
 *       early becomes the reason to act instead of a reason to dismiss.
 *
 *   count >= RAW_COUNT_THRESHOLD  →  "scale" mode.
 *       The raw number now carries its own weight, so we say it plainly:
 *       "Join 6,000 other real people who have signed."
 *
 * The switch is automatic. Nothing in this codebase needs revisiting when the
 * campaign works — the copy changes itself the moment the count crosses over.
 *
 * To change the crossover point, either edit the default below or set
 * `NEXT_PUBLIC_SIGNATURE_COUNT_THRESHOLD` in the environment (it must be
 * inlined at build time, hence the NEXT_PUBLIC_ prefix).
 */
const DEFAULT_RAW_COUNT_THRESHOLD = 5000;

function resolveThreshold(): number {
  const fromEnv = Number(process.env.NEXT_PUBLIC_SIGNATURE_COUNT_THRESHOLD);
  return Number.isFinite(fromEnv) && fromEnv > 0
    ? fromEnv
    : DEFAULT_RAW_COUNT_THRESHOLD;
}

export const RAW_COUNT_THRESHOLD = resolveThreshold();

/**
 * Cohort goals shown while we're in "early" mode. We show the first goal the
 * count hasn't passed yet, so the progress bar always has a visible gap left
 * to close. Capped at the threshold, past which "early" mode ends anyway.
 */
const GOAL_LADDER: number[] = Array.from(
  new Set(
    [1_000, 2_500, RAW_COUNT_THRESHOLD]
      .filter((goal) => goal <= RAW_COUNT_THRESHOLD)
      .sort((a, b) => a - b),
  ),
);

export function nextCohortGoal(count: number): number {
  return GOAL_LADDER.find((goal) => count < goal) ?? RAW_COUNT_THRESHOLD;
}

export type SignatureFraming =
  | {
      mode: "early";
      count: number;
      /** The cohort the visitor would be joining, e.g. 1000. */
      goal: number;
      /** Signatures still needed to close the gap. */
      remaining: number;
      /** 0–100, for the progress bar. */
      percent: number;
      /** The number the visitor would be, i.e. count + 1. */
      nextOrdinal: number;
    }
  | { mode: "scale"; count: number };

/**
 * Pure decision function: given a live signature count, which framing wins?
 * Everything visual in this file is derived from this, so the threshold
 * behaviour is testable without rendering anything.
 */
export function getSignatureFraming(count: number): SignatureFraming {
  const safeCount = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;

  if (safeCount >= RAW_COUNT_THRESHOLD) {
    return { mode: "scale", count: safeCount };
  }

  const goal = nextCohortGoal(safeCount);
  return {
    mode: "early",
    count: safeCount,
    goal,
    remaining: Math.max(goal - safeCount, 0),
    percent: Math.min(100, Math.max(0, Math.round((safeCount / goal) * 100))),
    nextOrdinal: safeCount + 1,
  };
}

const fmt = (n: number) => n.toLocaleString();

/**
 * How many signer chips the momentum panel renders. Three sit on one line at
 * desktop width; more wrap into a ragged block that reads as clutter rather
 * than as proof. Callers deliberately pass a *longer* sample than this so that
 * signers with a blank display name can be filtered out without shrinking the
 * row — see `loadSignerSample` in `src/app/page.tsx`.
 */
const RECENT_SIGNER_CHIPS = 3;

/** A signer shown as proof-of-quality while the raw count is still small. */
export type MomentumSigner = {
  displayName: string;
  affiliation: string | null;
  locationText: string | null;
};

function signerSubtitle(signer: MomentumSigner): string | null {
  const affiliation = signer.affiliation?.trim();
  if (affiliation) return affiliation;
  const location = signer.locationText?.trim();
  return location ? location : null;
}

/* -------------------------------------------------------------------------- */
/* Hero headline                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The line directly under the h1. Below the threshold it hands the visitor a
 * position to claim; above it, it states the number of signatures plainly.
 */
export function SignatureHeadline({ count }: { count: number }) {
  const framing = getSignatureFraming(count);

  if (framing.mode === "scale") {
    return (
      <>
        with{" "}
        <Link href="/signers" className="font-bold text-blue-600 hover:underline">
          {fmt(framing.count)} signatures
        </Link>{" "}
        to back them up.
      </>
    );
  }

  return (
    <>
      Be signer{" "}
      <Link href="/signers" className="font-bold text-blue-600 hover:underline">
        #{fmt(framing.nextOrdinal)}
      </Link>{" "}
      of the first {fmt(framing.goal)}.
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Progress meter                                                             */
/* -------------------------------------------------------------------------- */

function CohortProgressBar({
  count,
  goal,
  percent,
}: {
  count: number;
  goal: number;
  percent: number;
}) {
  return (
    <div
      role="progressbar"
      aria-valuenow={count}
      aria-valuemin={0}
      aria-valuemax={goal}
      aria-label={`${fmt(count)} of the first ${fmt(goal)} signatures`}
      className="mx-auto mt-5 h-2.5 w-full max-w-md overflow-hidden rounded-full bg-zinc-200"
    >
      <div
        className="h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-700 transition-[width] duration-500"
        // A sliver of colour so the bar never reads as broken at low counts.
        style={{ width: `${Math.max(percent, 2)}%` }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Main homepage panel                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The mid-page block that used to read "Join 90 other real people…". Below the
 * threshold it becomes a goal with a visible gap plus a sample of *who* has
 * signed — quality beats quantity while quantity is small. Above the
 * threshold it goes back to leading with the number.
 */
export function SignatureMomentumPanel({
  count,
  sample = [],
}: {
  count: number;
  sample?: MomentumSigner[];
}) {
  const framing = getSignatureFraming(count);

  if (framing.mode === "scale") {
    return (
      <div className="mx-auto max-w-5xl text-center">
        <p className="text-pretty text-2xl font-semibold leading-snug text-zinc-900 sm:text-3xl">
          Join{" "}
          <Link
            href="/signers"
            className="font-bold text-blue-600 hover:underline"
          >
            {fmt(framing.count)} other real people
          </Link>{" "}
          who have signed this AI Bill of Rights
        </p>
      </div>
    );
  }

  const named = sample
    .filter((s) => s.displayName.trim().length > 0)
    .slice(0, RECENT_SIGNER_CHIPS);

  return (
    <div className="mx-auto max-w-3xl text-center">
      <p className="text-pretty text-2xl font-semibold leading-snug text-zinc-900 sm:text-3xl">
        {fmt(framing.count)} of our first {fmt(framing.goal)} signatures
      </p>

      <CohortProgressBar
        count={framing.count}
        goal={framing.goal}
        percent={framing.percent}
      />

      <p className="mt-4 text-pretty text-lg leading-relaxed text-zinc-700">
        <strong className="font-semibold text-zinc-900">
          {fmt(framing.remaining)} to go.
        </strong>{" "}
        Sign now and you&apos;re number {fmt(framing.nextOrdinal)}.
      </p>

      {named.length > 0 && (
        <div className="mt-6">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
            Recently signed by
          </p>
          <ul className="mt-3 flex flex-wrap justify-center gap-2">
            {named.map((signer, i) => {
              const subtitle = signerSubtitle(signer);
              return (
                <li
                  key={`${signer.displayName}-${i}`}
                  className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-sm text-zinc-700"
                >
                  <span className="font-medium text-zinc-900">
                    {signer.displayName}
                  </span>
                  {subtitle !== null && (
                    <span className="text-zinc-500"> · {subtitle}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <p className="mt-6">
        <Link
          href="/signers"
          className="font-semibold text-blue-600 hover:underline"
        >
          See everyone who has signed →
        </Link>
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Floating CTA caption                                                       */
/* -------------------------------------------------------------------------- */

/** The one-line caption under the persistent floating sign button. */
export function SignatureMomentumChip({ count }: { count: number }) {
  const framing = getSignatureFraming(count);

  if (framing.mode === "scale") {
    return (
      <>
        Join{" "}
        <Link href="/signers" className="font-bold text-blue-600 hover:underline">
          {fmt(framing.count)} others
        </Link>{" "}
        who have already signed
      </>
    );
  }

  return (
    <>
      You&apos;d be signer{" "}
      <Link href="/signers" className="font-bold text-blue-600 hover:underline">
        #{fmt(framing.nextOrdinal)}
      </Link>{" "}
      of the first {fmt(framing.goal)}
    </>
  );
}
