"use server";

import { headers } from "next/headers";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { readReferralAttribution } from "@/lib/referral/request";
import { upsertSignerProfile } from "@/server/profile/upsert";
import { recordSignature } from "@/server/signatures/record";
import { hasSignedAnyVersion } from "@/server/signatures/has-signed";
import { getDb } from "@/lib/db/lazy";
import {
  renderConsentText,
  CURRENT_CONSENT_VERSION,
} from "@/lib/consent/render";
import { sha256Hex } from "@/lib/consent/hash";
import { extractCapturedFields } from "@/lib/fingerprint/extract";
import {
  signConfirmation,
  commentAccountCreated,
  signerNotification,
} from "@/lib/email/templates";
import {
  getSignatureCount,
  getSignatureNumber,
} from "@/lib/db/queries";
import { sendEmail } from "@/lib/email/send";
import { getOrCreateShareSlug } from "@/lib/share/short-links";

const TEAM_NOTIFICATION_EMAIL = "hello@ai-for-people.org";

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
  /**
   * Whether this signature came in through somebody's share link, and which
   * surface it arrived from. The client reports these to analytics — the
   * cookies are httpOnly, so the browser cannot work either out for itself,
   * and without them "which surface converts" stays unanswerable.
   *
   * These two answer deliberately different questions, and they can disagree:
   *
   * `referred` means "the database recorded a referrer for this signer" —
   * i.e. `signers.referred_by_signer_id` is non-null. It is NOT "the visitor
   * arrived carrying a ref cookie". A ref that named a since-deleted signer is
   * dropped at write time, and this reports `false` for it, because the whole
   * point of the flag is that analytics conversions must reconcile against
   * `countReferralsBySigner`. A `true` here is a row you can go and find.
   *
   * `channel` is independent of that: it is the `?via=` surface the visitor
   * arrived from, straight off the cookie, and it stays reportable even when
   * the ref did not survive. Share links can carry a `via` with no usable ref
   * at all, and "which surface converts" is a real question that shouldn't go
   * dark just because the referrer deleted their account. So expect — and do
   * not treat as a bug — events with `referred:false, channel:"linkedin"`.
   *
   * Never a signer id: `referred` is a boolean on purpose. Who referred whom
   * is a database question (`countReferralsBySigner`), not an analytics one.
   */
  referred?: boolean;
  channel?: string | null;
}

export async function recordSignatureFromModal(
  input: SignFromModalInput,
): Promise<SignFromModalResult> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Not authenticated. Please retry." };
    }

    // Someone who has signed ANY version is never signed again from the
    // modal: a returning signer who fills in the form lands on their share
    // view instead. Adding their name to a newer version is a deliberate act
    // on /v/<version> (reaffirmMySignature). Checked before the profile
    // upsert so a retyped name can't overwrite the one they signed under.
    if (await hasSignedAnyVersion(getDb(), userId)) {
      return {
        success: false,
        alreadySigned: true,
        error: "You've already signed the AI Bill of Rights.",
      };
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

    // What the cookie claims. This is an INPUT to the database write, not the
    // outcome of it: `upsertSignerProfile` runs the ref through
    // `resolveReferrerId` and will drop it if the referrer's row is gone. The
    // analytics `referred` flag below is therefore read back off the write,
    // never from here — see the doc on SignFromModalResult.
    const attribution = await readReferralAttribution();

    const profile = await upsertSignerProfile(getDb(), {
      clerkUserId: userId,
      displayName,
      affiliation: null,
      locationText,
      verificationMethod,
      notificationPreference: input.notificationPreference ?? "major",
      referredBySignerId: attribution.ref,
    });

    const consentText = renderConsentText(CURRENT_CONSENT_VERSION, {
      displayName,
      location: locationText ?? "",
      affiliation: "",
      verificationMethod,
      fields,
    });
    const consentTextHash = sha256Hex(consentText);

    // Persist the name-format choice alongside the existing fingerprint fields
    // so we can re-apply the masking later if a signer's row ever needs to be
    // reformatted (e.g., after a bug that defaulted to "full"). We intentionally
    // do NOT store the raw first/last name — the masked displayName is the only
    // form we keep.
    const capturedWithNamePrefs = {
      ...fields,
      name_display_format: input.nameDisplayFormat ?? "full",
    };
    try {
      await recordSignature(getDb(), {
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

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ?? "https://ai-for-people.org";
    const signerPageUrl = `${siteUrl}/signatories/${profile.id}`;

    // Confirmation email (best effort — failure does not block the signature)
    try {
      const clerk = await clerkClient();
      const user = await clerk.users.getUser(userId);
      const email = user.primaryEmailAddress?.emailAddress;
      if (email) {
        // Null when the count queries fail: the email then leaves the numbers
        // out rather than calling everyone "signer #1".
        let signatureNumber: number | null = null;
        let totalSignatures: number | null = null;
        try {
          [signatureNumber, totalSignatures] = await Promise.all([
            getSignatureNumber(profile.id),
            getSignatureCount(),
          ]);
        } catch (err) {
          console.warn("[email] failed to fetch signature counts:", err);
        }
        // Never throws: null (e.g. migration 0014 not applied) falls back to
        // the long /signatories/<id>?ref=<id> link inside the template.
        const shareSlug = await getOrCreateShareSlug(getDb(), profile.id).catch(
          () => null,
        );
        const tpl = signConfirmation({
          // The REAL first name — never the display name, which may be masked
          // ("E**** A*******"). Typed name first, then the Clerk account's.
          firstName: firstName || user.firstName?.trim() || null,
          version: input.versionString,
          signerPageUrl,
          revokeUrl: `${siteUrl}/account/revoke`,
          signatureNumber,
          totalSignatures,
          // Without this every share link in the email — the highest-volume
          // share surface we have — goes out with no ?ref= at all.
          signerId: profile.id,
          shareSlug,
        });
        await sendEmail({ to: email, ...tpl });
      }
    } catch (err) {
      console.error("[email] confirmation send failed:", err);
    }

    // Team notification (best effort, independent of the confirmation send so
    // a bad signer email can't suppress the new-signer ping to the team inbox).
    try {
      const tpl = signerNotification({ displayName, signerPageUrl });
      await sendEmail({ to: TEAM_NOTIFICATION_EMAIL, ...tpl });
    } catch (err) {
      console.error("[email] team notification send failed:", err);
    }

    return {
      success: true,
      signerId: profile.id,
      displayName,
      // The persisted attribution, not the cookie's claim about it.
      referred: profile.referredBySignerId !== null,
      channel: attribution.channel,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: msg };
  }
}

// ─── Comment-only account creation ────────────────────────────────────────────
// Creates a signer row (or returns the existing one) WITHOUT inserting a
// signatures row.  Used when a user authenticates in order to comment on the
// working draft but has not yet chosen to sign the bill.

export interface CreateSignerFromModalInput {
  firstName: string;
  lastName: string;
  method: "email" | "phone";
  shareLocation: boolean;
  nameDisplayFormat?: NameDisplayFormat;
  notificationPreference?: NotificationPreference;
}

export interface CreateSignerFromModalResult {
  success: boolean;
  error?: string;
  alreadyExists?: boolean;
  signerId?: string;
  displayName?: string;
}

export async function createSignerFromModal(
  input: CreateSignerFromModalInput,
): Promise<CreateSignerFromModalResult> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Not authenticated. Please retry." };
    }

    // Look up an existing signer BEFORE validating the name. A returning
    // signer who comes in through the modal's "Sign in" path is never shown the
    // name fields, and must not be refused for leaving them blank.
    const { db: prodDb } = await import("@/lib/db");
    const { signers } = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");

    const existing = await prodDb
      .select({ id: signers.id, displayName: signers.displayName })
      .from(signers)
      .where(eq(signers.clerkUserId, userId))
      .limit(1);

    if (existing.length > 0) {
      // Signer already exists — nothing to do, return their current info.
      return {
        success: true,
        alreadyExists: true,
        signerId: existing[0].id,
        displayName: existing[0].displayName,
      };
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

    // Same geo fallback as recordSignatureFromModal.
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
        console.warn("[createSigner] geo fallback failed:", err);
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

    const profile = await upsertSignerProfile(prodDb, {
      clerkUserId: userId,
      displayName,
      affiliation: null,
      locationText,
      verificationMethod,
      notificationPreference: input.notificationPreference ?? "major",
      referredBySignerId: (await readReferralAttribution()).ref,
    });

    // Confirmation email (best effort).
    try {
      const clerk = await clerkClient();
      const user = await clerk.users.getUser(userId);
      const email = user.primaryEmailAddress?.emailAddress;
      if (email) {
        const siteUrl =
          process.env.NEXT_PUBLIC_SITE_URL ?? "https://ai-for-people.org";
        const tpl = commentAccountCreated({
          displayName,
          siteUrl,
          accountUrl: `${siteUrl}/account`,
        });
        await sendEmail({ to: email, ...tpl });
      }
    } catch (err) {
      console.error("[email] comment-account confirmation failed:", err);
    }

    return { success: true, signerId: profile.id, displayName };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: msg };
  }
}
