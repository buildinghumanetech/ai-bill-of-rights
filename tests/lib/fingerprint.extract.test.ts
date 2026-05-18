import { describe, expect, it } from "vitest";
import { extractCapturedFields } from "@/lib/fingerprint/extract";

function h(values: Record<string, string>): Headers {
  return new Headers(values);
}

describe("extractCapturedFields", () => {
  it("parses User-Agent into browser/os/version", () => {
    const fields = extractCapturedFields(
      h({
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
        "x-forwarded-for": "203.0.113.45",
        "x-vercel-ip-city": "Madrid",
        "x-vercel-ip-country-region": "Madrid",
        "x-vercel-ip-country": "ES",
        "accept-language": "es-ES,es;q=0.9",
        referer: "https://twitter.com/abc",
        "x-vercel-ip-timezone": "Europe/Madrid",
      }),
      { sessionUtc: "2026-05-18T19:42:11Z" },
    );
    expect(fields.ip).toBe("203.0.113.45");
    expect(fields.ip_geo_city).toBe("Madrid");
    expect(fields.ip_geo_country).toBe("ES");
    expect(fields.browser_name).toMatch(/Safari/i);
    expect(fields.os_name).toMatch(/Mac/i);
    expect(fields.language).toBe("es-ES,es;q=0.9");
    expect(fields.referrer).toBe("https://twitter.com/abc");
    expect(fields.timezone).toBe("Europe/Madrid");
    expect(fields.signing_session_utc).toBe("2026-05-18T19:42:11Z");
  });

  it("handles missing optional headers without throwing", () => {
    const fields = extractCapturedFields(h({}), {
      sessionUtc: "2026-05-18T19:42:11Z",
    });
    expect(fields.ip).toBe("");
    expect(fields.signing_session_utc).toBe("2026-05-18T19:42:11Z");
  });

  it("prefers the first IP in a multi-hop x-forwarded-for", () => {
    const fields = extractCapturedFields(
      h({ "x-forwarded-for": "203.0.113.45, 10.0.0.1, 10.0.0.2" }),
      { sessionUtc: "2026-05-18T19:42:11Z" },
    );
    expect(fields.ip).toBe("203.0.113.45");
  });
});
