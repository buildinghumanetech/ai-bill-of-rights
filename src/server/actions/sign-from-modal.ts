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
type NotificationPreference = "major" | "minor" | "none";

// Belt-and-suspenders: even though extractCapturedFields decodes Vercel's
// URL-encoded geo headers, decode again right before write so any future
// upstream change that re-introduces percent-encoding can't leak into the DB.
function decodePercentEncoding(s: string): string {
  if (!s.includes("%")) return s;
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

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

    // On Vercel, x-vercel-ip-* headers populate the geo fields. On
    // localhost (or any non-Vercel environment) those headers are missing.
    // Fall back to a public IP-geolocation service so signers in dev still
    // see their actual city / region / country if they opt in.
    if (
      input.shareLocation &&
      !fields.ip_geo_city &&
      !fields.ip_geo_country
    ) {
      try {
        const res = await fetch("https://ipapi.co/json/", {
          headers: { "User-Agent": "ai-bill-of-rights-dev" },
          cache: "no-store",
        });
        if (res.ok) {
          const data = (await res.json()) as {
            city?: string;
            region?: string;
            country_code?: string;
          };
          fields.ip_geo_city = data.city ?? "";
          fields.ip_geo_region = data.region ?? "";
          fields.ip_geo_country = data.country_code ?? "";
        }
      } catch (err) {
        console.warn("[sign] geo fallback failed:", err);
      }
    }

    const locationText = input.shareLocation
      ? decodePercentEncoding(
          [fields.ip_geo_city, fields.ip_geo_region, fields.ip_geo_country]
            .filter(Boolean)
            .join(", "),
        ) || null
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

    // Persist the name-format choice (and the raw names that produced the
    // masked displayName) alongside the existing fingerprint fields. Lets us
    // re-apply / debug the format later if a signer's row ever needs to be
    // reformatted (e.g., after a bug that defaulted to "full").
    const capturedWithNamePrefs = {
      ...fields,
      name_display_format: input.nameDisplayFormat ?? "full",
      raw_first_name: input.firstName.trim(),
      raw_last_name: input.lastName.trim(),
    };
    try {
      await recordSignature(undefined, {
        signerId: profile.id,
        versionString: input.versionString,
        consentTextHash,
        capturedFields: capturedWithNamePrefs,
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
