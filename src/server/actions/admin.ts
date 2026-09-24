"use server";

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
  attestations,
  consentRecords,
  signatures,
  signers,
  versions,
} from "@/lib/db/schema";
import { getCurrentAdmin } from "@/lib/admin/check";
import { sha256Hex } from "@/lib/consent/hash";
import { anonymizeSigner } from "@/server/signers/anonymize";
import { deleteSigner } from "@/server/signers/delete";
import {
  insertNonSigner,
  type AdminAddNonSignerResult,
} from "@/server/admin/non-signers";
import { getDb } from "@/lib/db/lazy";

async function requireAdmin() {
  const ctx = await getCurrentAdmin();
  if (ctx.state !== "admin") {
    throw new Error("Forbidden: admin only");
  }
  return ctx;
}

/**
 * Admin "Delete": permanent removal. Runs the same `deleteSigner` cascade as
 * "Delete my account" on /account, so the signer row, their signatures (and
 * with them the public count), consent records, selfies, comments and
 * everything else keyed to them are gone. Other people's content survives;
 * see src/server/signers/delete.ts.
 *
 * Refuses the admin's own row. Deleting yourself here would also remove your
 * admin rights mid-session, with no in-app way back; use /account instead.
 */
export async function deleteSignerAction(
  signerId: string,
): Promise<{ success: boolean; error?: string }> {
  const ctx = await requireAdmin();
  if (ctx.signer.id === signerId) {
    return {
      success: false,
      error: "You can't delete your own signer here. Use /account instead.",
    };
  }
  const db = getDb();
  try {
    await deleteSigner(db, signerId);
    revalidateSignerPages(signerId);
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Admin "Anonymize": the same `anonymizeSigner` used by the user-facing
 * revoke flow. Scrubs private data (captured_fields, selfie blobs), renames
 * to "Anonymized signer #N", and KEEPS the signature and the public count.
 */
export async function anonymizeSignerAction(
  signerId: string,
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin();
  const db = getDb();
  try {
    await anonymizeSigner(db, signerId);
    revalidateSignerPages(signerId);
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

function revalidateSignerPages(signerId: string) {
  revalidatePath("/admin/signers");
  revalidatePath("/signers");
  revalidatePath(`/signatories/${signerId}`);
}

export async function deleteAttestationAction(
  attestationId: string,
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin();
  const db = getDb();
  try {
    await db
      .delete(attestations)
      .where(eq(attestations.id, attestationId));
    revalidatePath("/admin/attestations");
    revalidatePath("/attestations");
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function setAdminFlagAction(
  signerId: string,
  makeAdmin: boolean,
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin();
  const db = getDb();
  try {
    await db
      .update(signers)
      .set({ isAdmin: makeAdmin })
      .where(eq(signers.id, signerId));
    revalidatePath("/admin/signers");
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export interface EditSignerInput {
  signerId: string;
  displayName: string;
  affiliation: string;
  locationText: string;
}

export async function editSignerAction(
  input: EditSignerInput,
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin();
  const displayName = input.displayName.trim();
  if (!displayName) {
    return { success: false, error: "Display name is required." };
  }
  await getDb()
    .update(signers)
    .set({
      displayName,
      affiliation: input.affiliation.trim() || null,
      locationText: input.locationText.trim() || null,
    })
    .where(eq(signers.id, input.signerId));
  revalidatePath("/admin/signers");
  revalidatePath("/signers");
  revalidatePath(`/signatories/${input.signerId}`);
  return { success: true };
}

export interface AdminAddSignerInput {
  displayName: string;
  affiliation: string;
  locationText: string;
  verificationMethod: "email" | "sms";
  contactValue?: string;
  isAdmin: boolean;
  notificationPreference: "major" | "minor" | "none";
  versionString: string;
}

export interface AdminAddSignerResult {
  success: boolean;
  signerId?: string;
  error?: string;
}

/**
 * Admin-only: manually create a signer + signature row. Bypasses Clerk OTP;
 * uses a synthetic clerk_user_id (`admin-added-…`) since the column is
 * NOT NULL UNIQUE. The "verification" is the admin's word, recorded as
 * verification_method per their choice. Captured fields are minimal — we
 * stamp who added it so it's auditable.
 */
export async function adminAddSignerAction(
  input: AdminAddSignerInput,
): Promise<AdminAddSignerResult> {
  const ctx = await requireAdmin();
  const db = getDb();

  const displayName = input.displayName.trim();
  if (!displayName) {
    return { success: false, error: "Display name is required." };
  }

  const versionRows = await db
    .select()
    .from(versions)
    .where(eq(versions.version, input.versionString))
    .limit(1);
  if (versionRows.length === 0) {
    return {
      success: false,
      error: `Unknown version: ${input.versionString}`,
    };
  }
  const versionRow = versionRows[0];

  const adminSigner = ctx.signer;
  const syntheticClerkId = `admin-added-${randomUUID()}`;
  const contactValue = (input.contactValue ?? "").trim();
  const capturedFields = {
    source: "admin_added" as const,
    admin_signer_id: adminSigner.id,
    added_at_utc: new Date().toISOString(),
    contact_method: input.verificationMethod,
    // Stored privately on the consent record for outreach — never surfaced
    // publicly via signers/signatories views.
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

  // Build consent text hash (small, deterministic).
  const consentText = `admin-added|v${input.versionString}|${displayName}|${input.verificationMethod}`;
  const consentTextHash = sha256Hex(consentText);

  const [consent] = await db
    .insert(consentRecords)
    .values({
      signerId: signer.id,
      consentTextHash,
      capturedFields,
    })
    .returning({ id: consentRecords.id });

  await db.insert(signatures).values({
    signerId: signer.id,
    versionId: versionRow.id,
    versionHashAtSigning: versionRow.markdownHash,
    consentRecordId: consent.id,
  });

  revalidatePath("/admin/signers");
  revalidatePath("/signers");
  revalidatePath("/");

  return { success: true, signerId: signer.id };
}

export interface AdminAddNonSignerInput {
  displayName: string;
  affiliation: string;
  locationText: string;
  verificationMethod: "email" | "sms";
  contactValue?: string;
  isAdmin: boolean;
  notificationPreference: "major" | "minor" | "none";
}

/**
 * Admin-only: manually create a signer row WITHOUT a signature. Use when an
 * admin wants to give someone a comment-only account (registered but didn't
 * sign the bill). Same synthetic clerkUserId pattern as adminAddSignerAction;
 * same captured_fields auditing (source: "admin_added_non_signer").
 */
export async function adminAddNonSignerAction(
  input: AdminAddNonSignerInput,
): Promise<AdminAddNonSignerResult> {
  const ctx = await requireAdmin();
  const db = getDb();

  const displayName = input.displayName.trim();
  if (!displayName) {
    return { success: false, error: "Display name is required." };
  }

  const result = await insertNonSigner(db, {
    displayName,
    affiliation: input.affiliation,
    locationText: input.locationText,
    verificationMethod: input.verificationMethod,
    contactValue: input.contactValue,
    isAdmin: input.isAdmin,
    notificationPreference: input.notificationPreference,
    adminSignerId: ctx.signer.id,
  });

  if (result.success) {
    revalidatePath("/admin/signers");
    revalidatePath("/signers");
    revalidatePath("/");
  }

  return result;
}
