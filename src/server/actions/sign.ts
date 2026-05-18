"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@clerk/nextjs/server";
import { consentRecords, signatures, signers, versions } from "@/lib/db/schema";
import { extractCapturedFields, type CapturedFields } from "@/lib/fingerprint/extract";
import { renderConsentText, CURRENT_CONSENT_VERSION } from "@/lib/consent/render";
import { sha256Hex } from "@/lib/consent/hash";

// Use the lazy getDb() pattern established in src/lib/db/queries.ts to keep
// tests from instantiating the Neon client.
let _db: any | null = null;
function getDb() {
  if (!_db) _db = (require("@/lib/db") as { db: any }).db;
  return _db;
}

export interface RecordSignatureInput {
  signerId: string;
  versionString: string;
  consentTextHash: string;
  capturedFields: CapturedFields;
}

export async function recordSignature(
  dbClient: any = null,
  input: RecordSignatureInput,
): Promise<{ signatureId: string }> {
  const db = dbClient ?? getDb();
  const versionRows = await db
    .select()
    .from(versions)
    .where(eq(versions.version, input.versionString))
    .limit(1);
  if (versionRows.length === 0) {
    throw new Error(`Unknown version: ${input.versionString}`);
  }
  const versionRow = versionRows[0];

  // Two-step insert. The unique index on (signer_id, version_id) enforces
  // idempotency at the signatures level.
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

export async function submitSignAction(formData: FormData): Promise<void> {
  const { userId } = await auth();
  if (!userId) redirect("/");
  const consented = formData.get("consent");
  if (consented !== "yes") {
    throw new Error("Consent checkbox is required.");
  }
  const versionString = String(formData.get("version") ?? "");

  const signerRows = await getDb()
    .select()
    .from(signers)
    .where(eq(signers.clerkUserId, userId))
    .limit(1);
  if (signerRows.length === 0) {
    redirect(`/sign/profile?version=${encodeURIComponent(versionString)}`);
  }
  const signer = signerRows[0];

  const h = await headers();
  const fields = extractCapturedFields(h, {
    sessionUtc: new Date().toISOString(),
    screenResolution: (formData.get("screen") as string | null) ?? "",
  });

  const consentText = renderConsentText(CURRENT_CONSENT_VERSION, {
    displayName: signer.displayName,
    location: signer.locationText ?? "",
    affiliation: signer.affiliation ?? "",
    verificationMethod: signer.verificationMethod as "email" | "sms",
    fields,
  });
  const consentTextHash = sha256Hex(consentText);

  await recordSignature(getDb(), {
    signerId: signer.id,
    versionString,
    consentTextHash,
    capturedFields: fields,
  });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  try {
    const clerkClientFn = (await import("@clerk/nextjs/server")).clerkClient;
    const clerk = await clerkClientFn();
    const userObj = await clerk.users.getUser(userId);
    const email = userObj.primaryEmailAddress?.emailAddress;
    if (email) {
      const { signConfirmation } = await import("@/lib/email/templates");
      const { sendEmail } = await import("@/lib/email/send");
      const tpl = signConfirmation({
        displayName: signer.displayName,
        version: versionString,
        signerPageUrl: `${siteUrl}/signatories/${signer.id}`,
        revokeUrl: `${siteUrl}/account/revoke`,
      });
      await sendEmail({ to: email, ...tpl });
    }
  } catch (err) {
    // Email send failure should not block the signature flow.
    console.error("[email] confirmation send failed:", err);
  }

  redirect(`/sign/complete?version=${encodeURIComponent(versionString)}`);
}
