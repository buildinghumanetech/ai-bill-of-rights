"use server";

import { and, eq } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";
import { signatures, signers, versions } from "@/lib/db/schema";
import { deleteSigner } from "@/server/signers/delete";
import { getDb } from "@/lib/db/lazy";

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
 * Hard-deletes the current user's account by running the full cascade in
 * `@/server/signers/delete`. Do NOT read the list of destroyed tables from
 * here — `deleteSigner` is the authority, and it reaches far past signatures
 * and consent records: comments, votes, mentions, upvotes, endorsements,
 * proposals, selfies (rows and blobs), and other people's comments on this
 * signer's proposals all go with it. Anything that describes the blast radius
 * to a user (see the confirm dialog in src/app/SignModal.tsx) has to be kept
 * in step with that function, not with this comment.
 *
 * After this, the same Clerk session is free to sign again with new
 * preferences. The cascade is manual because neon-http has no transaction
 * support.
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

  // Delegate to the one cascade in @/server/signers/delete rather than
  // repeating a subset of
  // it here. This path used to delete only signatures + consent_records, which
  // left ~13 other FKs into signers.id intact: anyone who had endorsed a
  // version, commented, voted, proposed an edit or uploaded a selfie hit
  // SQLSTATE 23503 on the final DELETE and could not remove their own account.
  await deleteSigner(db, signerId);

  return { success: true };
}
