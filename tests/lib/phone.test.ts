import { describe, expect, it } from "vitest";
import {
  PHONE_COUNTRIES,
  countryOfInternational,
  isSmsSupported,
  smsCountries,
  toE164,
} from "@/lib/phone";

describe("toE164", () => {
  it("drops a UK trunk 0", () => {
    expect(toE164("07700 900123", "GB")).toBe("+447700900123");
  });
  it("keeps the 0 where the country needs it (Italy landlines)", () => {
    expect(toE164("06 6982 3456", "IT")).toBe("+390669823456");
  });
  it("accepts a pasted +number whatever country is selected", () => {
    expect(toE164("+44 7700 900123", "US")).toBe("+447700900123");
    expect(toE164("0044 7700 900123", "US")).toBe("+447700900123");
  });
  it("handles US formatting", () => {
    expect(toE164("(415) 555-2671", "US")).toBe("+14155552671");
  });
  it("rejects what is not a real number", () => {
    expect(toE164("123", "US")).toBeNull();
    expect(toE164("", "US")).toBeNull();
    expect(toE164("abc", "GB")).toBeNull();
  });
});

describe("countries", () => {
  it("lists far more than the old 50, US first, alphabetical after the priority few", () => {
    expect(PHONE_COUNTRIES.length).toBeGreaterThan(200);
    expect(PHONE_COUNTRIES[0].id).toBe("US");
    expect(PHONE_COUNTRIES.find((c) => c.id === "CZ")?.code).toBe("+420");
    expect(PHONE_COUNTRIES.find((c) => c.id === "GB")?.flag).toBe("🇬🇧");
  });
  it("names the country of a pasted international number", () => {
    expect(countryOfInternational("+34 612 345 678")).toBe("ES");
    expect(countryOfInternational("07700 900123")).toBeNull();
    // Same calling code as the current selection: leave the selection alone.
    expect(countryOfInternational("+44 7911 123456", "+44")).toBeNull();
  });
});

describe("SMS allowlist", () => {
  it("unset means every country", () => {
    expect(smsCountries(undefined)).toHaveLength(PHONE_COUNTRIES.length);
    expect(smsCountries("")).toHaveLength(PHONE_COUNTRIES.length);
  });
  it("restricts to the configured countries, case-insensitively", () => {
    expect(smsCountries("us, ca").map((c) => c.id).sort()).toEqual(["CA", "US"]);
  });
  it("falls back to everything if the config names no real country", () => {
    expect(smsCountries("ZZZ")).toHaveLength(PHONE_COUNTRIES.length);
  });
  it("compares calling codes, as Clerk does", () => {
    const us = smsCountries("US");
    expect(isSmsSupported("+14155552671", us)).toBe(true);
    expect(isSmsSupported("+12425551234", us)).toBe(true); // Bahamas shares +1
    expect(isSmsSupported("+447700900123", us)).toBe(false);
  });
});
