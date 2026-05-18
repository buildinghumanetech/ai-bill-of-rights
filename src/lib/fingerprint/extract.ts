import { UAParser } from "ua-parser-js";

export interface CapturedFields {
  ip: string;
  ip_geo_city: string;
  ip_geo_region: string;
  ip_geo_country: string;
  user_agent_raw: string;
  browser_name: string;
  browser_version: string;
  os_name: string;
  os_version: string;
  device_type: string;
  screen_resolution: string;
  timezone: string;
  language: string;
  referrer: string;
  signing_session_utc: string;
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
  const device = parser.getDevice();

  return {
    ip,
    ip_geo_city: headers.get("x-vercel-ip-city") ?? "",
    ip_geo_region: headers.get("x-vercel-ip-country-region") ?? "",
    ip_geo_country: headers.get("x-vercel-ip-country") ?? "",
    user_agent_raw: ua,
    browser_name: browser.name ?? "",
    browser_version: browser.version ?? "",
    os_name: os.name ?? "",
    os_version: os.version ?? "",
    device_type: device.type ?? "desktop",
    screen_resolution: context.screenResolution ?? "",
    timezone: headers.get("x-vercel-ip-timezone") ?? "",
    language: headers.get("accept-language") ?? "",
    referrer: headers.get("referer") ?? "",
    signing_session_utc: context.sessionUtc,
  };
}
