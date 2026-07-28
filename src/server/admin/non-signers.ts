/**
 * Admin-created comment-only accounts. Deliberately NOT a `"use server"`
 * module — see `src/server/signers/delete.ts` for the reasoning.
 *
 * `insertNonSigner` creates a signer row and takes `isAdmin` as a plain
 * argument, so exporting it from a `"use server"` file let an unauthenticated
 * POST mint itself an admin account.
 *
 * CALLERS MUST AUTHORISE — `adminAddNonSignerAction` in
 * `src/server/actions/admin.ts` goes through `requireAdminOrBootstrap()`.
 */

import { randomUUID } from "node:crypto";
import { consentRecords, signers } from "@/lib/db/schema";
import { sha256Hex } from "@/lib/consent/hash";

export interface AdminAddNonSignerResult {
  success: boolean;
  signerId?: string;
  error?: string;
}

/**
 * Pure data-layer function for creating a non-signer account. Exported so
 * tests can call it directly without mocking Clerk auth.
 */
export async function insertNonSigner(
  db: any,
  input: {
    displayName: string;
    affiliation: string;
    locationText: string;
    verificationMethod: "email" | "sms";
    contactValue?: string;
    isAdmin: boolean;
    notificationPreference: "major" | "minor" | "none";
    adminSignerId: string | null;
  },
): Promise<AdminAddNonSignerResult> {
  const displayName = input.displayName.trim();
  if (!displayName) {
    return { success: false, error: "Display name is required." };
  }

  const syntheticClerkId = `admin-added-non-signer-${randomUUID()}`;
  const contactValue = (input.contactValue ?? "").trim();
  const capturedFields = {
    source: "admin_added_non_signer" as const,
    admin_signer_id: input.adminSignerId,
    added_at_utc: new Date().toISOString(),
    contact_method: input.verificationMethod,
    contact_value: contactValue || null,
  };

  const [signer] = await db
    .insert(signers)
    .values({
      clerkUserId: syntheticClerkId,
      displayName,
      affiliation: input.affiliation.trim() || null,
      locationText: input.locationText.trim() || null,
      verificationMethod: input.verificationMethod,
      isAdmin: input.isAdmin,
      notificationPreference: input.notificationPreference,
      verifiedAt: new Date(),
    })
    .returning({ id: signers.id });

  // Build consent text hash (small, deterministic). No version part since
  // there is no signature to associate with a version.
  const consentText = `admin-added-non-signer|${displayName}|${input.verificationMethod}`;
  const consentTextHash = sha256Hex(consentText);

  await db
    .insert(consentRecords)
    .values({
      signerId: signer.id,
      consentTextHash,
      capturedFields,
    });

  return { success: true, signerId: signer.id };
}
