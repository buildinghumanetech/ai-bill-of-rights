import fs from "node:fs";
import path from "node:path";
import type { CapturedFields } from "@/lib/fingerprint/extract";

export interface ConsentRenderInput {
  displayName: string;
  location: string;
  affiliation: string;
  verificationMethod: "email" | "sms";
  fields: CapturedFields;
}

/**
 * Loads content/consent/v{N}.md and substitutes {{tokens}} with values.
 * Returns the rendered text exactly as the user will read it — this is the
 * string we hash and store in consent_records.consent_text_hash.
 */
export function renderConsentText(
  version: number,
  input: ConsentRenderInput,
): string {
  const template = fs.readFileSync(
    path.join(process.cwd(), `content/consent/v${version}.md`),
    "utf-8",
  );
  const substitutions: Record<string, string> = {
    display_name: input.displayName,
    location: input.location || "(not provided)",
    affiliation: input.affiliation || "(not provided)",
    verification_method: input.verificationMethod,
    ip: input.fields.ip,
    ip_geo_city: input.fields.ip_geo_city,
    ip_geo_country: input.fields.ip_geo_country,
    browser_name: input.fields.browser_name,
    browser_version: input.fields.browser_version,
    os_name: input.fields.os_name,
    os_version: input.fields.os_version,
    screen_resolution: input.fields.screen_resolution || "(not provided)",
    timezone: input.fields.timezone,
    language: input.fields.language,
    referrer: input.fields.referrer || "(none)",
    signing_session_utc: input.fields.signing_session_utc,
  };
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key) => {
    return substitutions[key] ?? "";
  });
}

export const CURRENT_CONSENT_VERSION = 1;
