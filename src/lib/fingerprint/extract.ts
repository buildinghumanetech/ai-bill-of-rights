import { UAParser } from "ua-parser-js";

export interface CapturedFields {
  ip: string;
  ip_geo_city: string;
  ip_geo_region: string;
  ip_geo_country: string;
  browser_name: string;
  browser_version: string;
  os_name: string;
  os_version: string;
  screen_resolution: string;
  timezone: string;
  language: string;
  referrer: string;
  signing_session_utc: string;
}

function decodeHeaderValue(raw: string | null): string {
  if (!raw) return "";
  try {
    return decodeURIComponent(raw);
  } catch {
    // Malformed encoding — keep raw rather than throw.
    return raw;
  }
}

export function extractCapturedFields(
  headers: Headers,
  context: {
    sessionUtc: string;
    screenResolution?: string;
  },
): CapturedFields {
  const xff = headers.get("x-forwarded-for") ?? "";
  const ip = xff.split(",")[0]?.trim() ?? "";
  const ua = headers.get("user-agent") ?? "";
  const parser = new UAParser(ua);
  const browser = parser.getBrowser();
  const os = parser.getOS();

  return {
    ip,
    // Vercel URL-encodes city names in x-vercel-ip-city so multi-word and
    // non-ASCII names survive header transit ("Menlo%20Park", "S%C3%A3o%20Paulo").
    // Decode here so downstream code never sees percent-encoding.
    ip_geo_city: decodeHeaderValue(headers.get("x-vercel-ip-city")),
    ip_geo_region: decodeHeaderValue(headers.get("x-vercel-ip-country-region")),
    ip_geo_country: decodeHeaderValue(headers.get("x-vercel-ip-country")),
    browser_name: browser.name ?? "",
    browser_version: browser.version ?? "",
    os_name: os.name ?? "",
    os_version: os.version ?? "",
    screen_resolution: context.screenResolution ?? "",
    timezone: headers.get("x-vercel-ip-timezone") ?? "",
    language: headers.get("accept-language") ?? "",
    referrer: headers.get("referer") ?? "",
    signing_session_utc: context.sessionUtc,
  };
}
