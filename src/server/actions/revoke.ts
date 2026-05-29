"use server";

import { eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { signers, selfies, selfieReports, consentRecords } from "@/lib/db/schema";
import { deleteSelfieBlobsByUrls } from "@/lib/storage/blob";
import type { SelfieBlobBackend } from "@/lib/storage/blob";
import { getSignatureNumber } from "@/lib/db/queries";

let _db: any | null = null;
function getDb() {
  if (!_db) _db = (require("@/lib/db") as { db: any }).db;
  return _db;
}

/**
 * Anonymizes a signer in place, honoring the promise in
 * `content/consent/v1.md`: "Revoking removes all private data above and
 * converts your public signature to 'Anonymized signer #N.' Your signature
 * itself remains — your data does not."
 *
 * We deliberately do NOT delete the signer/signature rows. The previous
 * hard-delete both (a) broke that promise — it destroyed the signature and the
 * count — and (b) threw a foreign-key violation for any signer who had voted,
 * reported, been @mentioned, endorsed, upvoted a proposal, or proposed an edit,
 * because those tables (comment_votes, comment_reports, comment_mentions,
 * endorsements, proposal_upvotes, proposed_edits) reference signers.id and were
 * never in the cascade. Anonymizing in place sidesteps the whole cascade.
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
 */
export async function anonymizeSigner(
  dbClient: any = null,
  signerId: string,
  blobBackend?: SelfieBlobBackend,
): Promise<void> {
  const db = dbClient ?? getDb();

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

export async function submitRevokeAction(): Promise<void> {
  const { userId } = await auth();
  if (!userId) redirect("/");
  const db = getDb();
  const rows = await db
    .select({ id: signers.id })
    .from(signers)
    .where(eq(signers.clerkUserId, userId))
    .limit(1);
  if (rows.length === 0) redirect("/");
  await anonymizeSigner(db, rows[0].id);
  redirect("/account?revoked=1");
}
