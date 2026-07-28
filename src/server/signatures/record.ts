/**
 * Signature + consent-record writes. Deliberately NOT a `"use server"` module
 * — see `src/server/signers/delete.ts` for the reasoning. `recordSignature`
 * takes the `signerId` to sign as, so exporting it from a `"use server"` file
 * let anyone forge a signature (and a consent record, which is the legal
 * artefact here) in someone else's name off their public signer id.
 *
 * CALLERS MUST AUTHORISE. The wrappers in `src/server/actions/sign.ts` and
 * `src/server/actions/sign-from-modal.ts` resolve the signer from the Clerk
 * session.
 */

import { eq } from "drizzle-orm";
import { consentRecords, signatures, versions } from "@/lib/db/schema";
import type { CapturedFields } from "@/lib/fingerprint/extract";

export interface RecordSignatureInput {
  signerId: string;
  versionString: string;
  consentTextHash: string;
  capturedFields: CapturedFields;
  /**
   * Permit writing a signature against a version that is no longer current.
   *
   * FOR FIXTURES ONLY — never set this from a request path. Signing an
   * archived version is not something any surface offers, and the version
   * string reaching `recordSignature` is client-supplied (see the check
   * below). Tests that need a *historical* signature — the `signed-earlier`
   * and re-affirm scenarios — are not signing; they are constructing a past
   * state that could only have arisen while that version WAS current, and
   * this is how they say so out loud.
   */
  allowArchivedVersion?: boolean;
}

export async function recordSignature(
  db: any,
  input: RecordSignatureInput,
): Promise<{ signatureId: string }> {
  const versionRows = await db
    .select()
    .from(versions)
    .where(eq(versions.version, input.versionString))
    .limit(1);
  if (versionRows.length === 0) {
    throw new Error(`Unknown version: ${input.versionString}`);
  }
  const versionRow = versionRows[0];

  if (!versionRow.isCurrent && !input.allowArchivedVersion) {
    // The version string is CLIENT-SUPPLIED all the way down: it comes off a
    // hidden form field in `submitProfileAction`, rides the redirect to
    // /sign/consent as a query param, and arrives here unvalidated. Without
    // this check, `/sign/profile?version=0.0.1` writes a brand-new signature
    // against an archived version — which then renders "v0.0.1" beside that
    // person on /signers, and resolves as `signed-earlier`, offering them a
    // re-affirm for a document they just signed.
    //
    // `reaffirmSignature` has always refused this (src/lib/db/reaffirm.ts:66).
    // The first-time path did not, so the two disagreed about an invariant the
    // `signed-earlier` UI assumes holds. Same rule, same chokepoint now.
    throw new Error(
      `Version ${input.versionString} is no longer open for signing.`,
    );
  }

  // The Neon HTTP driver does not support db.transaction(); we insert
  // consent first, then the signature. If the signatures insert fails (e.g.
  // unique-constraint double-submit) the orphan consent_records row is
  // acceptable — it can be swept by a periodic job. Atomic semantics here
  // would require switching to the neon-serverless WebSocket driver.
  const [record] = await db
    .insert(consentRecords)
    .values({
      signerId: input.signerId,
      consentTextHash: input.consentTextHash,
      capturedFields: input.capturedFields as unknown as object,
    })
    .returning({ id: consentRecords.id });

  const [sig] = await db
    .insert(signatures)
    .values({
      signerId: input.signerId,
      versionId: versionRow.id,
      versionHashAtSigning: versionRow.markdownHash,
      consentRecordId: record.id,
    })
    .returning({ id: signatures.id });

  return { signatureId: sig.id };
}
