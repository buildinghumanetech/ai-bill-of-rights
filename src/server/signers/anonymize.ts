/**
 * The signer-anonymisation path. Deliberately NOT a `"use server"` module, for
 * exactly the reason spelled out in `./delete.ts`: a `"use server"` directive
 * marks EVERY export of its file as a Server Function, Server Functions are
 * reachable by direct POST, and signer ids are public by design (`?ref=` in
 * every share link, the path segment of every `/signatories/<id>` page). An
 * exported `anonymizeSigner(null, "<signer-uuid>")` that resolved the
 * production db when handed `null` would be an unauthenticated "scrub any
 * account by id" endpoint.
 *
 * So `db` is a REQUIRED first argument and this lives in a plain module. Auth
 * belongs in the callers — `submitRevokeAction` in `src/server/actions/revoke.ts`
 * (the signer's own row) and `deleteSignerAction` in
 * `src/server/actions/admin.ts` (admin-gated). See `tests/server/actions.guarded.test.ts`.
 */

import { eq, sql } from "drizzle-orm";
import {
  signers,
  signatures,
  selfies,
  selfieReports,
  consentRecords,
} from "@/lib/db/schema";
import { deleteSelfieBlobsByUrls } from "@/lib/storage/blob";
import type { SelfieBlobBackend } from "@/lib/storage/blob";
import { getSignatureNumber } from "@/lib/db/queries";
import type { Db } from "@/lib/db/types";

/**
 * Anonymizes a signer in place, honoring the promise in
 * `content/consent/v1.md`: "Revoking removes all private data above and
 * converts your public signature to 'Anonymized signer #N.' Your signature
 * itself remains — your data does not."
 *
 * We deliberately do NOT delete the signer/signature rows. The previous
 * hard-delete broke that promise: it destroyed the signature and the count.
 * (It also threw foreign-key violations across ~14 tables; `./delete.ts` has
 * since fixed that separately, so the FK argument is no longer what motivates
 * this — the consent text is.)
 *
 * What we do (ordered fail-safe — the neon-http driver has no transactions, so
 * each statement commits on its own; we scrub the recoverable, reversible state
 * first and leave the one irreversible step (blob deletion) for last, so a
 * mid-way failure never leaves a face live next to a still-named profile):
 *   1. Blank the public profile fields, drop admin, and rename to
 *      "Anonymized signer #N" (N = the signer's signature ordinal) — or
 *      "Anonymized account" if they never actually signed. Because every public
 *      surface joins signers.display_name, this propagates to /signatories,
 *      /signers, the OG image, the live banner, and their retained comments.
 *   2. Null out consent_records.captured_fields (IP, geo, UA, contact_value)
 *      and stamp revoked_at. The row + consent_text_hash stay so the signature
 *      remains provable.
 *   3. Delete the signer's selfie rows + blobs — a face is private data. Last,
 *      because deleting a public blob is the only step we cannot undo.
 *
 * Signatures, comments, votes, endorsements, etc. are retained, now attributed
 * to the anonymized name. The `blobBackend` arg lets tests swap a fake.
 *
 * CALLER MUST AUTHORISE — see the module docstring.
 */
export async function anonymizeSigner(
  db: Db,
  signerId: string,
  blobBackend?: SelfieBlobBackend,
): Promise<void> {
  // 1) Anonymize the public profile FIRST (reversible, and the part the consent
  //    text promises). Use the signature ordinal as N when the signer actually
  //    signed; getSignatureNumber returns 1 for a signature-less signer, which
  //    would collide with the genuine first signer, so fall back to a plain
  //    "Anonymized account" label in that case.
  const sig = await db
    .select({ id: signatures.id })
    .from(signatures)
    .where(eq(signatures.signerId, signerId))
    .limit(1);
  const displayName =
    sig.length === 0
      ? "Anonymized account"
      : `Anonymized signer #${await getSignatureNumber(signerId, db)}`;
  await db
    .update(signers)
    .set({
      displayName,
      affiliation: null,
      locationText: null,
      isAdmin: false,
    })
    .where(eq(signers.id, signerId));

  // 2) Scrub the private capture fields but keep the consent record: its hash
  //    proves what was agreed to, and signatures.consent_record_id FKs to it.
  await db
    .update(consentRecords)
    .set({ capturedFields: null, revokedAt: new Date() })
    .where(eq(consentRecords.signerId, signerId));

  // 3) Selfies are private biometric data — delete blobs + rows LAST (the only
  //    irreversible step). Reports are deleted first (FK to selfies): both those
  //    authored by this signer and those filed against this signer's selfies.
  const signerSelfies = await db
    .select({
      displayBlobUrl: selfies.displayBlobUrl,
      thumbnailBlobUrl: selfies.thumbnailBlobUrl,
    })
    .from(selfies)
    .where(eq(selfies.signerId, signerId));
  for (const s of signerSelfies) {
    await deleteSelfieBlobsByUrls(
      { displayUrl: s.displayBlobUrl, thumbnailUrl: s.thumbnailBlobUrl },
      blobBackend,
    );
  }
  await db
    .delete(selfieReports)
    .where(eq(selfieReports.reporterSignerId, signerId));
  await db.execute(sql`
    DELETE FROM selfie_reports
    WHERE selfie_id IN (SELECT id FROM selfies WHERE signer_id = ${signerId})
  `);
  await db.delete(selfies).where(eq(selfies.signerId, signerId));
}
