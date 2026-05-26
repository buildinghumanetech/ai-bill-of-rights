"use server";

import { and, desc, eq, isNull } from "drizzle-orm";
import {
  attestations,
  consentRecords,
  signers,
  versions,
} from "@/lib/db/schema";
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
      submitterEmail: contactEmail,
      productUrl: productUrl ?? null,
      adminDashboardUrl: `${siteUrl}/admin/attestations`,
    });
    const recipients = await getAdminVerifierEmails();
    if (recipients.length === 0) {
      // No admins configured — fall back to the submitter so the system stays
      // unblocked during the no-admins-yet bootstrap window.
      console.warn(
        "[email] no admins to verify attestation; falling back to submitter email",
      );
      await sendEmail({ to: contactEmail, ...tpl });
    } else {
      await Promise.all(
        recipients.map((to) => sendEmail({ to, ...tpl })),
      );
    }
  } catch (err) {
    console.error("[email] attestation verify send failed:", err);
  }
  return { ok: true, id: result.id, needsManualReview: result.needsManualReview };
}

/**
 * Returns the contact email for every non-banned admin signer. For admins
 * with a real Clerk account, the primary Clerk email is used. For admin-added
 * accounts (synthetic clerkUserId starting with "admin-added-"), the email
 * stored in consent_records.captured_fields.contact_value is used.
 *
 * Phone-only contacts are skipped: contact_value can legitimately be a phone
 * number (admin chose SMS), but the verification template assumes an inbox.
 * Failures looking up one admin do not abort the rest.
 */
async function getAdminVerifierEmails(): Promise<string[]> {
  const db = getDb();
  const rows: { signerId: string; clerkUserId: string }[] = await db
    .select({ signerId: signers.id, clerkUserId: signers.clerkUserId })
    .from(signers)
    .where(and(eq(signers.isAdmin, true), isNull(signers.softBannedAt)));
  if (rows.length === 0) return [];

  const { clerkClient } = await import("@clerk/nextjs/server");
  const clerk = await clerkClient();

  const out = new Set<string>();
  await Promise.all(
    rows.map(async ({ signerId, clerkUserId }) => {
      // Real Clerk users: prefer the primary email.
      if (!clerkUserId.startsWith("admin-added-")) {
        try {
          const user = await clerk.users.getUser(clerkUserId);
          const primary = user.primaryEmailAddress?.emailAddress;
          if (primary) {
            out.add(primary.toLowerCase());
            return;
          }
          const any = user.emailAddresses[0]?.emailAddress;
          if (any) {
            out.add(any.toLowerCase());
            return;
          }
        } catch (err) {
          console.warn(
            `[email] Clerk lookup failed for admin ${clerkUserId}:`,
            err,
          );
        }
      }
      // Fall back to consent_records.captured_fields.contact_value. Use the
      // most recent record since signers can have multiple (e.g. revoke +
      // re-sign creates a second consent row).
      try {
        const consent = await db
          .select({ capturedFields: consentRecords.capturedFields })
          .from(consentRecords)
          .where(eq(consentRecords.signerId, signerId))
          .orderBy(desc(consentRecords.consentedAt))
          .limit(1);
        const cf = consent[0]?.capturedFields as
          | Record<string, unknown>
          | null;
        const raw = (cf?.contact_value ?? cf?.contact_email ?? "") as string;
        if (raw && raw.includes("@")) out.add(raw.toLowerCase());
      } catch (err) {
        console.warn(
          `[email] consent_records lookup failed for admin signer ${signerId}:`,
          err,
        );
      }
    }),
  );
  return Array.from(out);
}
