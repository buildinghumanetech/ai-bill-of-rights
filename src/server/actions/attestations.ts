"use server";

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

export async function submitAttestationAction(formData: FormData): Promise<{
  ok: true;
  id: string;
  needsManualReview: boolean;
}> {
  const orgName = String(formData.get("orgName") ?? "").trim();
  const productName = String(formData.get("productName") ?? "").trim();
  const productUrl = (formData.get("productUrl")?.toString() ?? "").trim() || null;
  const versionString = String(formData.get("version") ?? "");
  const contactEmail = String(formData.get("contactEmail") ?? "").trim();
  if (orgName.length === 0 || productName.length === 0 || contactEmail.length === 0) {
    throw new Error("orgName, productName, and contactEmail are required");
  }
  const result = await createAttestation(null, {
    orgName,
    productName,
    productUrl,
    versionString,
    contactEmail,
  });
  try {
    const { attestationVerifyEmail } = await import("@/lib/email/templates");
    const { sendEmail } = await import("@/lib/email/send");
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    const tpl = attestationVerifyEmail({
      orgName,
      productName,
      version: versionString,
      verifyUrl: `${siteUrl}/attestations/verify/${result.verificationToken}`,
    });
    await sendEmail({ to: contactEmail, ...tpl });
  } catch (err) {
    console.error("[email] attestation verify send failed:", err);
  }
  return { ok: true, id: result.id, needsManualReview: result.needsManualReview };
}
