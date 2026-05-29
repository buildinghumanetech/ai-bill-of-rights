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
  selfies,
  selfieReports,
  consentRecords,
} from "@/lib/db/schema";
import { deleteSelfieBlobsByUrls } from "@/lib/storage/blob";
import type { SelfieBlobBackend } from "@/lib/storage/blob";
import { getSignatureNumber } from "@/lib/db/queries";

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
 * What we do:
 *   1. Delete the signer's selfie blobs + rows — a face is private data.
 *   2. Null out consent_records.captured_fields (IP, geo, UA, contact_value)
 *      and stamp revoked_at. The row + consent_text_hash stay so the signature
 *      remains provable.
 *   3. Blank the public profile fields, drop admin, and rename to
 *      "Anonymized signer #N" (N = the signer's signature ordinal). Because
 *      every public surface joins signers.display_name, this propagates to
 *      /signatories, /signers, the OG image, the live banner, and their
 *      retained comments.
 *
 * Signatures, comments, votes, endorsements, etc. are retained, now attributed
 * to the anonymized name. The `blobBackend` arg lets tests swap a fake.
 *
 * CALLER MUST AUTHORISE — see the module docstring.
 */
export async function anonymizeSigner(
  db: any,
  signerId: string,
  blobBackend?: SelfieBlobBackend,
): Promise<void> {
  // 1) Selfies are private biometric data — delete blobs, then rows. Reports
  //    are deleted first (FK to selfies): both those authored by this signer
  //    and those filed against this signer's selfies.
  const signerSelfies = await db
    .select({
      originalBlobUrl: selfies.originalBlobUrl,
      displayBlobUrl: selfies.displayBlobUrl,
      thumbnailBlobUrl: selfies.thumbnailBlobUrl,
    })
    .from(selfies)
    .where(eq(selfies.signerId, signerId));
  for (const s of signerSelfies) {
    await deleteSelfieBlobsByUrls(
      {
        originalUrl: s.originalBlobUrl,
        displayUrl: s.displayBlobUrl,
        thumbnailUrl: s.thumbnailBlobUrl,
      },
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

  // 2) Scrub the private capture fields but keep the consent record: its hash
  //    proves what was agreed to, and signatures.consent_record_id FKs to it.
  await db
    .update(consentRecords)
    .set({ capturedFields: null, revokedAt: new Date() })
    .where(eq(consentRecords.signerId, signerId));

  // 3) Anonymize the public profile. N is the signature ordinal so the label is
  //    stable and matches the "Anonymized signer #N" wording in the consent text.
  const n = await getSignatureNumber(signerId, db);
  await db
    .update(signers)
    .set({
      displayName: `Anonymized signer #${n}`,
      affiliation: null,
      locationText: null,
      isAdmin: false,
    })
    .where(eq(signers.id, signerId));
}
