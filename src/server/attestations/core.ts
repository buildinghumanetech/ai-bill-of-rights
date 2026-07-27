/**
 * Attestation writes. Deliberately NOT a `"use server"` module — see
 * `src/server/signers/delete.ts` for the reasoning.
 *
 * `approveAttestation` and `hideAttestation` are moderator decisions with no
 * auth check of their own, so exporting them from a `"use server"` file let a
 * direct POST publish or bury any org's attestation by id. `createAttestation`
 * and `verifyAttestationToken` are public-by-design, but both take a leading
 * `dbClient: any` argument that no browser should be able to supply.
 *
 * `verifyAttestationToken` is authorised by the unguessable token in the
 * emailed link, not by a session, which is why it is safe for the public
 * verify page (a server component) to import it from here directly.
 */

import { eq } from "drizzle-orm";
import { attestations, versions } from "@/lib/db/schema";
import { needsManualReview } from "@/lib/attestations/allowlist";
import { generateVerificationToken } from "@/lib/attestations/token";

let _db: any | null = null;
function getDb() {
  if (!_db) _db = (require("@/lib/db") as { db: any }).db;
  return _db;
}

export interface CreateAttestationInput {
  orgName: string;
  productName: string;
  productUrl: string | null;
  versionString: string;
  contactEmail: string;
}

export async function createAttestation(
  dbClient: any = null,
  input: CreateAttestationInput,
): Promise<{
  id: string;
  verificationToken: string;
  needsManualReview: boolean;
}> {
  const db = dbClient ?? getDb();
  const v = await db
    .select()
    .from(versions)
    .where(eq(versions.version, input.versionString))
    .limit(1);
  if (v.length === 0) {
    throw new Error(`Unknown version: ${input.versionString}`);
  }
  const verificationToken = generateVerificationToken();
  const flagged = needsManualReview(input.orgName);
  const [row] = await db
    .insert(attestations)
    .values({
      orgName: input.orgName,
      productName: input.productName,
      productUrl: input.productUrl,
      versionId: v[0].id,
      contactEmail: input.contactEmail,
      verificationToken,
      needsManualReview: flagged,
    })
    .returning({ id: attestations.id });
  return {
    id: row.id,
    verificationToken,
    needsManualReview: flagged,
  };
}

export async function verifyAttestationToken(
  dbClient: any = null,
  token: string,
): Promise<{ id: string; published: boolean; needsManualReview: boolean }> {
  const db = dbClient ?? getDb();
  const rows = await db
    .select()
    .from(attestations)
    .where(eq(attestations.verificationToken, token))
    .limit(1);
  if (rows.length === 0) {
    throw new Error("Unknown verification token");
  }
  const row = rows[0];
  const shouldPublish = !row.needsManualReview;
  await db
    .update(attestations)
    .set({
      emailVerifiedAt: new Date(),
      published: shouldPublish,
    })
    .where(eq(attestations.id, row.id));
  return {
    id: row.id,
    published: shouldPublish,
    needsManualReview: row.needsManualReview,
  };
}

/** Admin-only. The caller must have established that — there is no check here. */
export async function approveAttestation(
  dbClient: any = null,
  attestationId: string,
): Promise<void> {
  const db = dbClient ?? getDb();
  await db
    .update(attestations)
    .set({
      manuallyReviewedAt: new Date(),
      manuallyApproved: true,
      published: true,
    })
    .where(eq(attestations.id, attestationId));
}

/** Admin-only. The caller must have established that — there is no check here. */
export async function hideAttestation(
  dbClient: any = null,
  attestationId: string,
  _reason: string,
): Promise<void> {
  const db = dbClient ?? getDb();
  await db
    .update(attestations)
    .set({
      hiddenAt: new Date(),
      manuallyApproved: false,
    })
    .where(eq(attestations.id, attestationId));
}
