/**
 * Signer-profile writes. Deliberately NOT a `"use server"` module — see
 * `src/server/signers/delete.ts` for the full reasoning. In short: every
 * export of a `"use server"` file is a POST-reachable Server Function, and
 * `upsertSignerProfile` takes a `clerkUserId` from its caller, so exporting it
 * from one let anyone rewrite any signer's display name, affiliation and
 * location by id.
 *
 * CALLERS MUST AUTHORISE. The wrappers in `src/server/actions/profile.ts` and
 * `src/server/actions/sign-from-modal.ts` pass the Clerk id off the session,
 * never one supplied by the client.
 */

import { eq } from "drizzle-orm";
import { signers } from "@/lib/db/schema";
import { resolveReferrerId } from "@/lib/referral/attribution";

// Lazily resolve the production db so that importing this module in tests
// (which always pass an explicit `db`) does not trigger the DATABASE_URL guard
// inside src/lib/db/index.ts at module-evaluation time.
let _db: any | null = null;
function getDb() {
  if (!_db) _db = (require("@/lib/db") as { db: any }).db;
  return _db;
}

export type NotificationPreference = "major" | "minor" | "none";

export interface ProfileInput {
  clerkUserId: string;
  displayName: string;
  affiliation: string | null;
  locationText: string | null;
  verificationMethod: "email" | "sms";
  notificationPreference?: NotificationPreference;
  /**
   * Raw ref value (a signer id) from the visitor's attribution cookie.
   * Applied on INSERT only — see the note in upsertSignerProfile.
   */
  referredBySignerId?: string | null;
}

export interface UpsertSignerProfileResult {
  id: string;
  /**
   * The attribution that is actually on the row now — NOT the ref the caller
   * passed in. On INSERT the raw ref has been through `resolveReferrerId` and
   * may have been dropped (dangling id, malformed value, lookup failure); on
   * UPDATE this is whatever was written when the signer first arrived, since
   * that branch never rewrites attribution.
   *
   * Callers that report attribution to analytics MUST read it from here rather
   * than from the cookie, or they will report referrals the database does not
   * have and no reconciliation will ever line up.
   */
  referredBySignerId: string | null;
}

export async function upsertSignerProfile(
  db: any = getDb(),
  input: ProfileInput,
): Promise<UpsertSignerProfileResult> {
  const existing = await db
    .select()
    .from(signers)
    .where(eq(signers.clerkUserId, input.clerkUserId))
    .limit(1);

  const notificationPreference = input.notificationPreference ?? "major";

  if (existing.length > 0) {
    // Deliberately omits referredBySignerId: attribution is a fact about how
    // someone first arrived, so it is written once at INSERT and never
    // rewritten by a later profile edit.
    await db
      .update(signers)
      .set({
        displayName: input.displayName,
        affiliation: input.affiliation,
        locationText: input.locationText,
        verificationMethod: input.verificationMethod,
        notificationPreference,
      })
      .where(eq(signers.clerkUserId, input.clerkUserId));
    // Report back the attribution already on the row, not the ref that was
    // handed to us and deliberately ignored above — the caller needs to know
    // what is stored, not what it asked for.
    return {
      id: existing[0].id,
      referredBySignerId: existing[0].referredBySignerId ?? null,
    };
  }

  // Validated against the signers table so a stale or hostile ref can't fail
  // the insert; returns null on any doubt. `resolveReferrerId` also drops a
  // self-referral, but that branch cannot fire from here — we only reach this
  // code when no signer row exists for this Clerk user, so the fetched row can
  // never be theirs. See the docstring in src/lib/referral/attribution.ts.
  const referredBySignerId = await resolveReferrerId(db, {
    ref: input.referredBySignerId,
    clerkUserId: input.clerkUserId,
  });

  const [row] = await db
    .insert(signers)
    .values({
      clerkUserId: input.clerkUserId,
      displayName: input.displayName,
      affiliation: input.affiliation,
      locationText: input.locationText,
      verificationMethod: input.verificationMethod,
      notificationPreference,
      referredBySignerId,
      verifiedAt: new Date(),
    })
    .returning({ id: signers.id });
  return { id: row.id, referredBySignerId };
}
