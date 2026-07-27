"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth, clerkClient } from "@clerk/nextjs/server";
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

export async function submitProfileAction(formData: FormData): Promise<void> {
  const { userId } = await auth();
  if (!userId) {
    redirect("/");
  }
  const displayName = String(formData.get("displayName") ?? "").trim();
  if (displayName.length === 0) {
    throw new Error("Display name is required");
  }
  const affiliation = (formData.get("affiliation")?.toString() ?? "").trim() || null;
  const locationText = (formData.get("location")?.toString() ?? "").trim() || null;
  const version = String(formData.get("version") ?? "0.0.1");
  // Derive verificationMethod from the real Clerk user object (I-1 fix).
  // Session claims do not carry a reliable primary_verification key, so we
  // fetch the user and check which identifier is primary.
  const clerk = await clerkClient();
  const clerkUser = await clerk.users.getUser(userId);
  const method: "email" | "sms" =
    clerkUser.primaryPhoneNumberId && !clerkUser.primaryEmailAddressId
      ? "sms"
      : "email";

  await upsertSignerProfile(getDb(), {
    clerkUserId: userId,
    displayName,
    affiliation,
    locationText,
    verificationMethod: method,
  });

  redirect(`/sign/consent?version=${encodeURIComponent(version)}`);
}
