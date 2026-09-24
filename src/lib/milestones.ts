/**
 * The one goal story the whole site tells — headline, thank-you step and
 * confirmation email all read from here, so they can never name different
 * targets.
 *
 * Small, reachable milestones first: "9 more to reach 100" is a gap a signer
 * can picture closing by bringing two friends; "909 more to reach 1,000" is
 * not. Past 1,000 the ladder keeps going so there is always a next number.
 *
 * Plain module on purpose: the email templates run on the server and must not
 * pull in React or next/link to get at a number.
 */
export const MILESTONES: readonly number[] = [100, 250, 500, 1_000, 2_500, 5_000];

/** The first milestone the count hasn't reached yet. */
export function nextMilestone(count: number): number {
  const safe = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  return MILESTONES.find((m) => safe < m) ?? MILESTONES[MILESTONES.length - 1];
}

/** How many signatures are still needed to reach the next milestone. */
export function remainingToMilestone(count: number): number {
  const safe = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  return Math.max(nextMilestone(safe) - safe, 0);
}

/**
 * "9 more to reach 100." — or null once the ladder is exhausted, where a
 * milestone line would have nothing true to say.
 */
export function milestoneLine(count: number): string | null {
  const remaining = remainingToMilestone(count);
  if (remaining === 0) return null;
  const goal = nextMilestone(count);
  return `${remaining.toLocaleString("en-US")} more to reach ${goal.toLocaleString("en-US")}.`;
}
