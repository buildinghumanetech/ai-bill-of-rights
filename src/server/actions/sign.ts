"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@clerk/nextjs/server";
import { signers } from "@/lib/db/schema";
import { extractCapturedFields } from "@/lib/fingerprint/extract";
import { renderConsentText, CURRENT_CONSENT_VERSION } from "@/lib/consent/render";
import { sha256Hex } from "@/lib/consent/hash";
import { recordSignature } from "@/server/signatures/record";

// Use the lazy getDb() pattern established in src/lib/db/queries.ts to keep
// tests from instantiating the Neon client.
let _db: any | null = null;
function getDb() {
  if (!_db) _db = (require("@/lib/db") as { db: any }).db;
  return _db;
}

/**
 * The insert itself lives in `@/server/signatures/record`, a plain module,
 * because everything exported from this file is a POST-reachable Server
 * Function and `recordSignature` takes the signer id to sign as. Here it
 * comes off the Clerk session.
 */
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

  // Use the sessionUtc the consent page stamped into the hidden field so the
  // hash we store matches the text the user actually read (C-1 fix).
  const sessionUtc = String(formData.get("signing_session_utc") ?? new Date().toISOString());
  const h = await headers();
  const fields = extractCapturedFields(h, {
    sessionUtc,
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
  const signerPageUrl = `${siteUrl}/signatories/${signer.id}`;

  try {
    const clerkClientFn = (await import("@clerk/nextjs/server")).clerkClient;
    const clerk = await clerkClientFn();
    const userObj = await clerk.users.getUser(userId);
    const email = userObj.primaryEmailAddress?.emailAddress;
    if (email) {
      const { signConfirmation } = await import("@/lib/email/templates");
      const { sendEmail } = await import("@/lib/email/send");
      const { getSignatureCount, getSignatureNumber } = await import("@/lib/db/queries");
      let signatureNumber = 1;
      let totalSignatures = 1;
      try {
        [signatureNumber, totalSignatures] = await Promise.all([
          getSignatureNumber(signer.id),
          getSignatureCount(),
        ]);
      } catch (err) {
        console.warn("[email] failed to fetch signature counts:", err);
      }
      const tpl = signConfirmation({
        displayName: signer.displayName,
        version: versionString,
        signerPageUrl,
        revokeUrl: `${siteUrl}/account/revoke`,
        signatureNumber,
        totalSignatures,
        // Without this every share link in the email — the highest-volume
        // share surface we have — goes out with no ?ref= at all.
        signerId: signer.id,
      });
      await sendEmail({ to: email, ...tpl });
    }
  } catch (err) {
    // Email send failure should not block the signature flow.
    console.error("[email] confirmation send failed:", err);
  }

  // Notify the team. Independent of the signer-confirmation send so a failure
  // on one doesn't suppress the other (e.g., a bad signer email shouldn't
  // hide the new-signer notification from the team inbox).
  try {
    const { signerNotification } = await import("@/lib/email/templates");
    const { sendEmail } = await import("@/lib/email/send");
    const tpl = signerNotification({
      displayName: signer.displayName,
      signerPageUrl,
    });
    await sendEmail({ to: "hello@ai-for-people.org", ...tpl });
  } catch (err) {
    console.error("[email] team notification send failed:", err);
  }

  redirect(`/sign/complete?version=${encodeURIComponent(versionString)}`);
}
