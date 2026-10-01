import type { CapturedFields } from "@/lib/fingerprint/extract";

/**
 * A complete `CapturedFields` for tests, with only the bits a test cares about
 * overridden.
 *
 * `recordSignature` requires the full shape, because in production it always
 * comes from `extractCapturedFields()`, which fills every key. Tests only ever
 * care about one or two, so they had all been passing `{} as any` — which
 * satisfied the compiler by switching it off, and would equally have accepted a
 * typo'd or renamed key. Now a renamed field breaks the fixture, which is the
 * point.
 *
 * Empty strings rather than plausible-looking values: a test that depends on a
 * particular value should say so in its own override, not inherit it from here.
 */
export function capturedFields(
  overrides: Partial<CapturedFields> = {},
): CapturedFields {
  return {
    ip: "",
    ip_geo_city: "",
    ip_geo_region: "",
    ip_geo_country: "",
    browser_name: "",
    browser_version: "",
    os_name: "",
    os_version: "",
    screen_resolution: "",
    timezone: "",
    language: "",
    referrer: "",
    signing_session_utc: "",
    ...overrides,
  };
}
