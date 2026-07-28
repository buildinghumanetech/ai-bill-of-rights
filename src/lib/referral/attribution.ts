/**
 * Turning a ref cookie into a `signers.referred_by_signer_id` value.
 *
 * The governing rule: ATTRIBUTION MUST NEVER COST US A SIGNATURE. Every way
 * this can go wrong — a stale ref pointing at a deleted signer, a malformed
 * value, the database being unhappy — resolves to `null` rather than throwing,
 * so the worst case is an unattributed signature instead of a lost one.
 *
 * A caveat about self-referral, so nobody reads more protection into this
 * module than it currently provides: `resolveReferrerId` contains a
 * self-referral check, but ON THE CURRENT CALL PATH IT CANNOT FIRE. Its only
 * caller is the INSERT branch of `upsertSignerProfile` (src/server/actions/
 * profile.ts), which by definition runs when no signer row exists for that
 * Clerk user — so the row fetched here can never be theirs. Self-referral is
 * not being actively blocked in production; it is simply not reachable,
 * because a person cannot hold their own signer id before they have one. The
 * check is kept as defence-in-depth for any future caller, and is exercised
 * directly by tests/server/profile.attribution.test.ts.
 */

import { eq } from "drizzle-orm";
import { signers } from "@/lib/db/schema";
import { isValidRef } from "@/lib/share/urls";

export interface ResolveReferrerOptions {
  /** Raw ref value from the cookie — unvalidated by contract. */
  ref?: string | null;
  /**
   * Clerk user id of the person being attributed. Would reject self-referral —
   * sharing your own link back to yourself is not a referral — but see the
   * module docstring: no current caller can reach that case.
   */
  clerkUserId?: string | null;
}

/**
 * Resolve a ref into a referring signer id, or null if it can't be trusted.
 *
 * Drops the ref when it is malformed or points at a signer id that doesn't
 * exist (which would otherwise blow up on the foreign key at INSERT time).
 * It also drops a ref pointing at the signer themselves — an unreachable case
 * from the only caller today; see the module docstring.
 */
export async function resolveReferrerId(
  db: any,
  opts: ResolveReferrerOptions,
): Promise<string | null> {
  const { ref, clerkUserId } = opts;
  if (!isValidRef(ref)) return null;

  try {
    const rows = await db
      .select({ id: signers.id, clerkUserId: signers.clerkUserId })
      .from(signers)
      .where(eq(signers.id, ref))
      .limit(1);

    const row = rows[0];
    // Dangling ref — the referrer's row is gone. Dropping it here is what
    // keeps the INSERT from failing its foreign key and taking the whole
    // signature down with it.
    if (!row) return null;
    // Self-referral. Dead on the current call path — `upsertSignerProfile`
    // only calls this while INSERTing a signer that does not exist yet, so
    // `row` can never be the caller's own. Kept because it is one comparison
    // and the day someone calls this from an UPDATE or a backfill it becomes
    // the only thing standing between us and self-inflated referral counts.
    if (clerkUserId && row.clerkUserId === clerkUserId) return null;
    return row.id as string;
  } catch (err) {
    console.warn("[referral] could not resolve referrer; dropping ref:", err);
    return null;
  }
}
