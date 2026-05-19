"use server";

import { and, eq } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";
import {
  consentRecords,
  signatures,
  signers,
  versions,
} from "@/lib/db/schema";

let _db: any | null = null;
function getDb() {
  if (!_db) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _db = require("@/lib/db").db;
  }
  return _db;
}

export interface SignedStatus {
  state: "signed";
  displayName: string;
  verificationMethod: "email" | "sms";
  signedAt: string; // ISO so it crosses the server/client boundary cleanly
  version: string;
}

export type SignatureStatus =
  | { state: "anonymous" }
  | { state: "no-signer" }
  | { state: "not-signed" }
  | SignedStatus;

/**
 * Returns whether the currently signed-in Clerk user has already signed a
 * given version (defaulting to v0.0.1). Used by SignModal to decide between
 * showing the sign form vs. the "already signed" view.
 */
export async function getMySignatureStatus(
  versionString = "0.0.1",
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
  const signer = signerRows[0];

  const sigRows = await db
    .select({
      signedAt: signatures.signedAt,
      version: versions.version,
    })
    .from(signatures)
    .innerJoin(versions, eq(versions.id, signatures.versionId))
    .where(
      and(
        eq(signatures.signerId, signer.id),
        eq(versions.version, versionString),
      ),
    )
    .limit(1);

  if (sigRows.length === 0) return { state: "not-signed" };

  return {
    state: "signed",
    displayName: signer.displayName,
    verificationMethod: signer.verificationMethod,
    signedAt:
      sigRows[0].signedAt instanceof Date
        ? sigRows[0].signedAt.toISOString()
        : String(sigRows[0].signedAt),
    version: sigRows[0].version,
  };
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
