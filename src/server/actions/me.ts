"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { auth } from "@clerk/nextjs/server";
import { consentRecords, signatures, signers } from "@/lib/db/schema";
import {
  resolveSignatureStatus,
  type SignerSignatureStatus,
} from "@/lib/db/signature-status";
import { recordSignature } from "./sign";
import { extractCapturedFields } from "@/lib/fingerprint/extract";
import { renderConsentText, CURRENT_CONSENT_VERSION } from "@/lib/consent/render";
import { sha256Hex } from "@/lib/consent/hash";

let _db: any | null = null;
function getDb() {
  if (!_db) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _db = require("@/lib/db").db;
  }
  return _db;
}

export type SignatureStatus =
  | { state: "anonymous" }
  | { state: "no-signer" }
  | SignerSignatureStatus;

/**
 * Returns the signed-in Clerk user's relationship to a given version
 * (defaulting to the current published version). Used by SignModal to choose
 * between the sign form, the "already signed" view, and the re-affirm view.
 *
 * Someone who signed an earlier version reads as "signed-earlier", NOT
 * "not-signed" — see the note on SignedEarlierStatus. Their signature is
 * intact and still counted everywhere; what they are offered is a chance to
 * re-affirm the new text, not a blank form.
 */
export async function getMySignatureStatus(
  versionString = "0.1.0",
): Promise<SignatureStatus> {
  const { userId } = await auth();
  if (!userId) return { state: "anonymous" };

  const db = getDb();
  const signerRows = await db
    .select()
    .from(signers)
    .where(eq(signers.clerkUserId, userId))
    .limit(1);
  if (signerRows.length === 0) return { state: "no-signer" };

  return resolveSignatureStatus(db, signerRows[0], versionString);
}

/**
 * Records a signature for the current user against `versionString`, reusing
 * the profile they already gave us.
 *
 * This is the "re-affirm" path for someone who signed an earlier version. It
 * is a real, freshly consented signature — a new consent record is rendered
 * and hashed against the text of the version being affirmed, exactly as a
 * first-time signature is — not a backfilled copy of the old one. Nobody is
 * ever recorded as having agreed to text they did not act on.
 *
 * Their earlier signature is left untouched: the two rows together are the
 * record of which versions this person has affirmed and when.
 */
export async function reaffirmMySignature(
  versionString: string,
): Promise<{ success: boolean; error?: string }> {
  const { userId } = await auth();
  if (!userId) return { success: false, error: "Not signed in." };

  const db = getDb();
  const signerRows = await db
    .select()
    .from(signers)
    .where(eq(signers.clerkUserId, userId))
    .limit(1);
  if (signerRows.length === 0) {
    return { success: false, error: "No signature on this account." };
  }
  const signer = signerRows[0];

  const h = await headers();
  const fields = extractCapturedFields(h, {
    sessionUtc: new Date().toISOString(),
    screenResolution: "",
  });
  const consentText = renderConsentText(CURRENT_CONSENT_VERSION, {
    displayName: signer.displayName,
    location: signer.locationText ?? "",
    affiliation: signer.affiliation ?? "",
    verificationMethod: signer.verificationMethod as "email" | "sms",
    fields,
  });

  try {
    await recordSignature(db, {
      signerId: signer.id,
      versionString,
      consentTextHash: sha256Hex(consentText),
      capturedFields: fields,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    // Double-submit, or they signed this version in another tab. Either way
    // the desired end state already holds, so report success.
    if (/duplicate key|unique/i.test(msg)) return { success: true };
    return { success: false, error: "We couldn't record your signature." };
  }

  return { success: true };
}

/**
 * Hard-deletes the current user's signer row + every signature and consent
 * record they own. After this, the same Clerk session is free to sign again
 * with new preferences. Cascading manually because neon-http has no
 * transaction support.
 */
export async function removeMySignature(): Promise<{
  success: boolean;
  error?: string;
}> {
  const { userId } = await auth();
  if (!userId) return { success: false, error: "Not signed in." };

  const db = getDb();
  const signerRows = await db
    .select()
    .from(signers)
    .where(eq(signers.clerkUserId, userId))
    .limit(1);
  if (signerRows.length === 0) {
    return { success: false, error: "No signature on this account." };
  }
  const signerId = signerRows[0].id;

  await db.delete(signatures).where(eq(signatures.signerId, signerId));
  await db.delete(consentRecords).where(eq(consentRecords.signerId, signerId));
  await db.delete(signers).where(eq(signers.id, signerId));

  return { success: true };
}
