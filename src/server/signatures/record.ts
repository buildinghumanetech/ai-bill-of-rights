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
