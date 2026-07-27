/**
 * Attestation writes. Deliberately NOT a `"use server"` module — see
 * `src/server/signers/delete.ts` for the reasoning.
 *
 * `approveAttestation` and `hideAttestation` are moderator decisions with no
 * auth check of their own, so exporting them from a `"use server"` file let a
 * direct POST publish or bury any org's attestation by id. `createAttestation`
 * and `verifyAttestationToken` are public-by-design, but every function here
 * takes a leading `db` argument that no browser should be able to supply.
 * It is required, not optional-with-a-production-fallback — see
 * `src/lib/db/lazy.ts` for why that distinction matters.
 *
 * `verifyAttestationToken` is authorised by the unguessable token in the
 * emailed link, not by a session, which is why it is safe for the public
 * verify page (a server component) to import it from here directly.
 *
 * NOT click-gated. The token authorises ANY request that carries it, and
 * `src/app/attestations/verify/[token]/page.tsx` is a `force-dynamic` server
 * component that calls this during render — so a plain GET publishes. A
 * mail-gateway link scanner, an email client prefetching links, or a proxy
 * warming the URL will publish the organisation's public claim with no human
 * involved. The only thing standing between the email and publication is
 * possession of the token. If that ever needs to become a real human
 * decision, the verify page has to render a confirm button that POSTs
 * instead of verifying during render.
 */

import { eq } from "drizzle-orm";
import { attestations, versions } from "@/lib/db/schema";
import { needsManualReview } from "@/lib/attestations/allowlist";
import { generateVerificationToken } from "@/lib/attestations/token";

export interface CreateAttestationInput {
  orgName: string;
  productName: string;
  productUrl: string | null;
  versionString: string;
  contactEmail: string;
}

export async function createAttestation(
  db: any,
  input: CreateAttestationInput,
): Promise<{
  id: string;
  verificationToken: string;
  needsManualReview: boolean;
}> {
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
  db: any,
  token: string,
): Promise<{ id: string; published: boolean; needsManualReview: boolean }> {
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
  db: any,
  attestationId: string,
): Promise<void> {
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
  db: any,
  attestationId: string,
  _reason: string,
): Promise<void> {
  await db
    .update(attestations)
    .set({
      hiddenAt: new Date(),
      manuallyApproved: false,
    })
    .where(eq(attestations.id, attestationId));
}
