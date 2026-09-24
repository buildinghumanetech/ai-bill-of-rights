"use server";

import { redirect } from "next/navigation";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { upsertSignerProfile } from "@/server/profile/upsert";
import { getDb } from "@/lib/db/lazy";
import { readReferralAttribution } from "@/lib/referral/request";

/**
 * The write itself lives in `@/server/profile/upsert`, a plain module,
 * because everything exported from this file is a POST-reachable Server
 * Function and `upsertSignerProfile` takes the Clerk id to write as an
 * argument. Here it always comes off the session.
 */
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
  const version = String(formData.get("version") ?? "0.1.0");
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
    // The ref cookie the proxy stamped on arrival. Without this, anyone who
    // came in through a share link and created their signer row here (the
    // older /sign/profile flow) was never credited to the person who shared
    // it. `upsertSignerProfile` validates it and applies it on INSERT only.
    referredBySignerId: (await readReferralAttribution()).ref,
  });

  redirect(`/sign/consent?version=${encodeURIComponent(version)}`);
}
