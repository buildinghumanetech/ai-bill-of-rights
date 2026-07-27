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
import { deleteSigner } from "@/server/actions/revoke";

let _db: any | null = null;
function getDb() {
  if (!_db) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _db = require("@/lib/db").db;
  }
  return _db;
}

async function requireAdminOrBootstrap() {
  const ctx = await getCurrentAdmin();
  if (ctx.state !== "admin" && ctx.state !== "no-admins-yet") {
    throw new Error("Forbidden: admin only");
  }
  return ctx;
}

export async function bootstrapAdminAction(): Promise<void> {
  const ctx = await getCurrentAdmin();
  if (ctx.state !== "no-admins-yet") {
    throw new Error(
      "Bootstrap not available — an admin already exists or you are not signed in.",
    );
  }
  await getDb()
    .update(signers)
    .set({ isAdmin: true })
    .where(eq(signers.id, ctx.signer.id));
  revalidatePath("/admin/signers");
}

export async function deleteSignerAction(signerId: string): Promise<void> {
  await requireAdminOrBootstrap();
  const db = getDb();
  // Delegate to the one cascade in revoke.ts. This action used to carry its
  // own partial copy (reports, comment_upvotes, comments, signatures,
  // consent_records) which drifted out of date as tables were added: the
  // Delete button 500'd with SQLSTATE 23503 on anyone who had endorsed a
  // version, voted on a comment, proposed an edit or uploaded a selfie.
  await deleteSigner(db, signerId);
  revalidatePath("/admin/signers");
  revalidatePath("/signers");
}

export async function deleteAttestationAction(
  attestationId: string,
): Promise<{ success: boolean; error?: string }> {
  await requireAdminOrBootstrap();
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
): Promise<void> {
  await requireAdminOrBootstrap();
  await getDb()
    .update(signers)
    .set({ isAdmin: makeAdmin })
    .where(eq(signers.id, signerId));
  revalidatePath("/admin/signers");
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
  await requireAdminOrBootstrap();
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
  const ctx = await requireAdminOrBootstrap();
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

  const adminSigner =
    ctx.state === "admin" ? ctx.signer : ctx.state === "no-admins-yet" ? ctx.signer : null;
  const syntheticClerkId = `admin-added-${randomUUID()}`;
  const contactValue = (input.contactValue ?? "").trim();
  const capturedFields = {
    source: "admin_added" as const,
    admin_signer_id: adminSigner?.id ?? null,
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

export interface AdminAddNonSignerResult {
  success: boolean;
  signerId?: string;
  error?: string;
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
  const ctx = await requireAdminOrBootstrap();
  const db = getDb();

  const displayName = input.displayName.trim();
  if (!displayName) {
    return { success: false, error: "Display name is required." };
  }

  const adminSigner =
    ctx.state === "admin" || ctx.state === "no-admins-yet" ? ctx.signer : null;

  const result = await insertNonSigner(db, {
    displayName,
    affiliation: input.affiliation,
    locationText: input.locationText,
    verificationMethod: input.verificationMethod,
    contactValue: input.contactValue,
    isAdmin: input.isAdmin,
    notificationPreference: input.notificationPreference,
    adminSignerId: adminSigner?.id ?? null,
  });

  if (result.success) {
    revalidatePath("/admin/signers");
    revalidatePath("/signers");
    revalidatePath("/");
  }

  return result;
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
