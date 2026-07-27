/**
 * The database half of "why I signed".
 *
 * ─── MODULE BOUNDARY — READ BEFORE MERGING THIS BACK ───
 * This file is deliberately separate from `./why-i-signed.ts`. That module is
 * pure text helpers and is imported by `SignModal.tsx` ("use client") and by
 * `@/lib/share/share-text`, which the same client component imports. This file
 * imports drizzle and the full `@/lib/db/schema` table graph, so merging the
 * two would ship all of that to every browser that loads the home page. Import
 * from HERE only from server actions, route handlers and server components.
 */

import { eq } from "drizzle-orm";
import { signers } from "@/lib/db/schema";
import { enforceEphemeralRateLimit } from "@/lib/ratelimit/enforce";
import { normalizeWhyISigned } from "@/lib/why-i-signed";

/**
 * How often one signer may rewrite their statement.
 *
 * The statement is public and lands in a cached OG image, so a tight loop of
 * edits is both a moderation-evasion vector (write something vile, let it get
 * shared, swap it back) and a cache-thrash vector. Ten an hour is far more than
 * anyone editing in good faith needs.
 */
export const WHY_I_SIGNED_EDITS_PER_HOUR = 10;
const WHY_I_SIGNED_WINDOW_SEC = 3600;

/**
 * Write the statement onto the signer row owned by `clerkUserId`.
 *
 * The `WHERE clerk_user_id = ...` is the ownership check: there is no signer-id
 * parameter, so a caller can never address someone else's row. Returns null
 * when the session has no signer record yet.
 */
export async function updateWhyISignedForClerkUser(
  db: any,
  clerkUserId: string,
  raw: unknown,
): Promise<{ signerId: string; whyISigned: string | null } | null> {
  const whyISigned = normalizeWhyISigned(raw);
  const rows = await db
    .update(signers)
    .set({ whyISigned })
    .where(eq(signers.clerkUserId, clerkUserId))
    .returning({ id: signers.id, whyISigned: signers.whyISigned });
  if (rows.length === 0) return null;
  return { signerId: rows[0].id, whyISigned: rows[0].whyISigned ?? null };
}

export type SaveWhyISignedOutcome =
  | { ok: true; signerId: string; whyISigned: string | null }
  | { ok: false; reason: "no_signer" | "rate_limited"; error: string };

/**
 * Rate-limited write of a signer's statement — the core the server action and
 * the tests both drive, with `db` passed in so it can run against pglite.
 *
 * The limit is checked BEFORE the update so a rejected attempt leaves the
 * stored statement untouched, and it is keyed on the signer row rather than the
 * Clerk id so the bucket survives an email change.
 */
export async function saveWhyISignedForClerkUser(
  db: any,
  clerkUserId: string,
  raw: unknown,
): Promise<SaveWhyISignedOutcome> {
  const owner = await db
    .select({ id: signers.id })
    .from(signers)
    .where(eq(signers.clerkUserId, clerkUserId))
    .limit(1);
  if (owner.length === 0) {
    return {
      ok: false,
      reason: "no_signer",
      error: "No signature on this account.",
    };
  }

  try {
    enforceEphemeralRateLimit({
      bucket: "why_i_signed",
      key: owner[0].id,
      windowSec: WHY_I_SIGNED_WINDOW_SEC,
      max: WHY_I_SIGNED_EDITS_PER_HOUR,
    });
  } catch {
    return {
      ok: false,
      reason: "rate_limited",
      error: `You've changed your statement too many times in the last hour. Try again later.`,
    };
  }

  const updated = await updateWhyISignedForClerkUser(db, clerkUserId, raw);
  if (!updated) {
    return {
      ok: false,
      reason: "no_signer",
      error: "No signature on this account.",
    };
  }
  return { ok: true, signerId: updated.signerId, whyISigned: updated.whyISigned };
}
