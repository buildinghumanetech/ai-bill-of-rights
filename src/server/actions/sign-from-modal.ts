"use server";

import { headers } from "next/headers";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { upsertSignerProfile } from "./profile";
import { recordSignature } from "./sign";
import {
  renderConsentText,
  CURRENT_CONSENT_VERSION,
} from "@/lib/consent/render";
import { sha256Hex } from "@/lib/consent/hash";
import { extractCapturedFields } from "@/lib/fingerprint/extract";
import { signConfirmation } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/send";

type NameDisplayFormat = "initials" | "first-initial" | "full";
type NotificationPreference = "major" | "minor" | "proposed";

export interface SignFromModalInput {
  firstName: string;
  lastName: string;
  method: "email" | "phone";
  shareLocation: boolean;
  versionString: string;
  nameDisplayFormat?: NameDisplayFormat;
  notificationPreference?: NotificationPreference;
}

// Local helper (kept private — "use server" disallows non-async exports).
function formatDisplayName(
  first: string,
  last: string,
  format: NameDisplayFormat,
): string {
  const f = first.trim();
  const l = last.trim();
  if (format === "full") return `${f} ${l}`.trim();
  const maskedLast = l
    ? `${l[0].toUpperCase()}${"*".repeat(Math.max(0, l.length - 1))}`
    : "";
  if (format === "first-initial") return `${f} ${maskedLast}`.trim();
  const maskedFirst = f
    ? `${f[0].toUpperCase()}${"*".repeat(Math.max(0, f.length - 1))}`
    : "";
  return `${maskedFirst} ${maskedLast}`.trim();
}

export interface SignFromModalResult {
  success: boolean;
  error?: string;
  alreadySigned?: boolean;
  signerId?: string;
  displayName?: string;
}

export async function recordSignatureFromModal(
  input: SignFromModalInput,
): Promise<SignFromModalResult> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Not authenticated. Please retry." };
    }

    const firstName = input.firstName.trim();
    const lastName = input.lastName.trim();
    if (!firstName || !lastName) {
      return { success: false, error: "First and last name are required." };
    }
    const displayName = formatDisplayName(
      firstName,
      lastName,
      input.nameDisplayFormat ?? "full",
    );

    const h = await headers();
    const fields = extractCapturedFields(h, {
      sessionUtc: new Date().toISOString(),
    });

    const locationText = input.shareLocation
      ? [fields.ip_geo_city, fields.ip_geo_region, fields.ip_geo_country]
          .filter(Boolean)
          .join(", ") || null
      : null;

    const verificationMethod: "email" | "sms" =
      input.method === "email" ? "email" : "sms";

    const profile = await upsertSignerProfile(undefined, {
      clerkUserId: userId,
      displayName,
      affiliation: null,
      locationText,
      verificationMethod,
      notificationPreference: input.notificationPreference ?? "major",
    });

    const consentText = renderConsentText(CURRENT_CONSENT_VERSION, {
      displayName,
      location: locationText ?? "",
      affiliation: "",
      verificationMethod,
      fields,
    });
    const consentTextHash = sha256Hex(consentText);

    try {
      await recordSignature(undefined, {
        signerId: profile.id,
        versionString: input.versionString,
        consentTextHash,
        capturedFields: fields,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (/duplicate key|unique/i.test(msg)) {
        return {
          success: false,
          alreadySigned: true,
          error: "You have already signed this version.",
        };
      }
      throw err;
    }

    // Confirmation email (best effort — failure does not block the signature)
    try {
      const clerk = await clerkClient();
      const user = await clerk.users.getUser(userId);
      const email = user.primaryEmailAddress?.emailAddress;
      if (email) {
        const siteUrl =
          process.env.NEXT_PUBLIC_SITE_URL ?? "https://ai-for-people.org";
        const tpl = signConfirmation({
          displayName,
          version: input.versionString,
          signerPageUrl: `${siteUrl}/signatories/${profile.id}`,
          revokeUrl: `${siteUrl}/account/revoke`,
        });
        await sendEmail({ to: email, ...tpl });
      }
    } catch (err) {
      console.error("[email] confirmation send failed:", err);
    }

    return { success: true, signerId: profile.id, displayName };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: msg };
  }
}
