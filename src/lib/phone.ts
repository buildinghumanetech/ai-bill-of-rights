/**
 * Phone numbers for the sign modal: the country list, and turning what a
 * person typed into the E.164 string Clerk needs ("+447700900123").
 *
 * Why not `${code}${digits}`: a UK reader types "07700 900123", and gluing
 * that onto +44 gives +4407700900123, which Clerk rejects. The leading 0 is a
 * domestic "trunk prefix" that must be dropped for most countries (and kept
 * for a few, like Italy). libphonenumber-js knows which; we do not.
 */

import {
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js";

export interface PhoneCountry {
  id: CountryCode;
  /** Calling code with the plus, e.g. "+44". */
  code: string;
  flag: string;
  name: string;
}

/** Shown first, in this order. Everything else follows alphabetically. */
const FIRST: ReadonlyArray<CountryCode> = ["US", "CA", "GB", "AU", "MX", "IN"];

function flagOf(id: string): string {
  // Regional-indicator letters: "GB" renders as the UK flag.
  return String.fromCodePoint(
    ...[...id].map((ch) => 0x1f1a5 + ch.charCodeAt(0)),
  );
}

function buildCountries(): PhoneCountry[] {
  const names = new Intl.DisplayNames(["en"], { type: "region" });
  const all = getCountries().map((id) => ({
    id,
    code: `+${getCountryCallingCode(id)}`,
    flag: flagOf(id),
    name: names.of(id) ?? id,
  }));
  const rank = (id: CountryCode) => {
    const i = FIRST.indexOf(id);
    return i === -1 ? FIRST.length : i;
  };
  return all.sort(
    (a, b) => rank(a.id) - rank(b.id) || a.name.localeCompare(b.name, "en"),
  );
}

export const PHONE_COUNTRIES: ReadonlyArray<PhoneCountry> = buildCountries();

/**
 * E.164 for what the person typed, or null when it is not a real number.
 *
 * A number that starts with "+" (or "00") is taken as already international
 * and the selected country is ignored, so pasting "+44 7700 900123" works
 * even with the United States selected.
 */
export function toE164(raw: string, countryId: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  const international = text.startsWith("+") || text.startsWith("00");
  const parsed = international
    ? parsePhoneNumberFromString(
        text.startsWith("00") ? `+${text.slice(2)}` : text,
      )
    : parsePhoneNumberFromString(text, countryId as CountryCode);
  // isPossible (length and shape), not isValid (the exact allocated ranges):
  // our metadata can lag newly assigned ranges, and a false "invalid" locks
  // out a real person. Clerk is the authority on the rest.
  return parsed?.isPossible() ? parsed.number : null;
}

/**
 * The country a pasted "+..." number belongs to, so the dropdown can follow it.
 * Null when it is not international, or when it already shares the calling
 * code of `currentCode` (a "+44" number should not flip a United Kingdom
 * selection to Guernsey just because that mobile range is Guernsey's).
 */
export function countryOfInternational(
  raw: string,
  currentCode?: string,
): CountryCode | null {
  const text = raw.trim();
  if (!text.startsWith("+")) return null;
  const parsed = parsePhoneNumberFromString(text);
  if (!parsed?.country) return null;
  if (currentCode && currentCode === `+${parsed.countryCallingCode}`) return null;
  return parsed.country;
}

/** "+44 7700 900123", for showing back to the person. Null if invalid. */
export function formatInternational(e164: string): string | null {
  return parsePhoneNumberFromString(e164)?.formatInternational() ?? null;
}

/**
 * The countries we offer SMS codes to. Clerk only texts countries enabled in
 * its dashboard (SMS > Settings; by default only the US and Canada), so this
 * list must match that setting. It is configured, not guessed:
 * NEXT_PUBLIC_SMS_COUNTRIES="US,CA,GB" (ISO codes, comma separated). Unset
 * means "offer every country", which is the old behavior; set it as soon as
 * the Clerk allowlist is known, so nobody picks a country that cannot receive
 * a code.
 */
export function smsCountries(
  spec: string | undefined,
): ReadonlyArray<PhoneCountry> {
  const wanted = (spec ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  if (wanted.length === 0) return PHONE_COUNTRIES;
  const list = PHONE_COUNTRIES.filter((c) => wanted.includes(c.id));
  return list.length > 0 ? list : PHONE_COUNTRIES;
}

/**
 * Whether a code can be texted to this number. Clerk's allowlist works on the
 * calling code ("+1" covers every +1 number), so compare calling codes, not
 * countries: a Caribbean +1 number is fine when the US is enabled.
 */
export function isSmsSupported(
  e164: string,
  countries: ReadonlyArray<PhoneCountry>,
): boolean {
  const code = parsePhoneNumberFromString(e164)?.countryCallingCode;
  return code !== undefined && countries.some((c) => c.code === `+${code}`);
}
