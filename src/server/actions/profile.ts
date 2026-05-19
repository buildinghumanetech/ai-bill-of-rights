"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { signers } from "@/lib/db/schema";

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
}

export async function upsertSignerProfile(
  db: any = getDb(),
  input: ProfileInput,
): Promise<{ id: string }> {
  const existing = await db
    .select()
    .from(signers)
    .where(eq(signers.clerkUserId, input.clerkUserId))
    .limit(1);

  const notificationPreference = input.notificationPreference ?? "major";

  if (existing.length > 0) {
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
    return { id: existing[0].id };
  }

  const [row] = await db
    .insert(signers)
    .values({
      clerkUserId: input.clerkUserId,
      displayName: input.displayName,
      affiliation: input.affiliation,
      locationText: input.locationText,
      verificationMethod: input.verificationMethod,
      notificationPreference,
      verifiedAt: new Date(),
    })
    .returning({ id: signers.id });
  return { id: row.id };
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
  const version = String(formData.get("version") ?? "1.0.0");
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
