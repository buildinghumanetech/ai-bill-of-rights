/**
 * Turning a ref cookie into a `signers.referred_by_signer_id` value.
 *
 * The governing rule: ATTRIBUTION MUST NEVER COST US A SIGNATURE. Every way
 * this can go wrong — a stale ref pointing at a deleted signer, a malformed
 * value, the database being unhappy — resolves to `null` rather than throwing,
 * so the worst case is an unattributed signature instead of a lost one.
 */

import { eq } from "drizzle-orm";
import { signers } from "@/lib/db/schema";
import { isValidRef } from "@/lib/share/urls";

export interface ResolveReferrerOptions {
  /** Raw ref value from the cookie — unvalidated by contract. */
  ref?: string | null;
  /**
   * Clerk user id of the person being attributed. Used to reject
   * self-referral: sharing your own link back to yourself is not a referral.
   */
  clerkUserId?: string | null;
}

/**
 * Resolve a ref into a referring signer id, or null if it can't be trusted.
 *
 * Drops the ref when it is: malformed, pointing at a signer id that doesn't
 * exist (which would otherwise blow up on the foreign key at INSERT time), or
 * pointing at the signer themselves.
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
    if (clerkUserId && row.clerkUserId === clerkUserId) return null;
    return row.id as string;
  } catch (err) {
    console.warn("[referral] could not resolve referrer; dropping ref:", err);
    return null;
  }
}
