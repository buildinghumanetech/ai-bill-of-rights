"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { auth } from "@clerk/nextjs/server";
import { signatures, signers } from "@/lib/db/schema";
import {
  resolveSignatureStatus,
  type SignerSignatureStatus,
} from "@/lib/db/signature-status";
import { reaffirmSignature } from "@/lib/db/reaffirm";
import { extractCapturedFields } from "@/lib/fingerprint/extract";
import { renderConsentText, CURRENT_CONSENT_VERSION } from "@/lib/consent/render";
import { sha256Hex } from "@/lib/consent/hash";
import { deleteSigner } from "@/server/signers/delete";
// This branch had its own require()-based lazy getDb; `main` has since factored
// the same trick into a shared module, so use that rather than keeping a second
// copy of it here.
import { getDb } from "@/lib/db/lazy";

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
 * writes a real, new signature row — never a backfilled copy of the old one —
 * so nobody is ever recorded as having agreed to a version they did not act
 * on. Their earlier signature is left untouched: the two rows together are the
 * record of which versions this person has affirmed and when.
 *
 * What binds this signature to the new text is `signatures.version_hash_at_
 * signing`, which `reaffirmSignature` copies from the version row. It is NOT
 * the consent hash: `renderConsentText` renders `content/consent/v*.md`, the
 * data-collection disclosure, which contains no bill text and no bill version
 * — so that hash is identical whichever version is affirmed. Do not read the
 * consent record as evidence of which document text someone agreed to.
 *
 * No confirmation email is sent, unlike the first-time sign paths. That is
 * deliberate for now: this action can be triggered for every existing signer
 * by a routine version publish, and mailing the whole signer list is a
 * decision to make on purpose rather than as a side effect. Revisit if
 * re-affirm becomes a common flow.
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

  // NO RATE LIMIT HERE, deliberately — read this before adding one back.
  //
  // A counter over rows this action creates cannot trip. reaffirmSignature
  // writes at most ONE signature per (signer, version), enforced by a unique
  // index, and writes a consent record only when it is about to create that
  // signature — deleting it again if the insert fails. So nothing unbounded is
  // written, and a `count(*) ... FROM signatures WHERE signer_id = $1` bound
  // would sit at 1 forever no matter how often the action were called. A limit
  // that can never reject is worse than none: it reads as protection.
  //
  // What WOULD be worth bounding is ATTEMPTS — the refusal paths above and
  // below cost an auth() round trip and a couple of selects each, and a
  // rejected caller can currently repeat them for free. Counting attempts
  // needs somewhere to record them, i.e. a rate-limit table and a migration;
  // migrations here are applied by hand (see AGENTS.md), so that is a decision
  // to take on purpose rather than smuggle in with a review fix.
  //
  // Until then, note honestly what a rejected caller costs us: an auth() round
  // trip, two or three selects, one consent-text render and a sha256. All CPU
  // and cheap reads, no writes — the same order of cost as any other server
  // action, which is the reason this is a "worth doing" and not a "must fix".

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
    const res = await reaffirmSignature(db, {
      signerId: signer.id,
      versionString,
      consentTextHash: sha256Hex(consentText),
      capturedFields: fields,
    });
    if (!res.ok) return { success: false, error: res.error };
  } catch {
    return { success: false, error: "We couldn't record your signature." };
  }

  return { success: true };
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
