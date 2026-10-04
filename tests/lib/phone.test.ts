import { describe, expect, it } from "vitest";
import {
  PHONE_COUNTRIES,
  countryOfInternational,
  isSmsSupported,
  SMS_COUNTRY_IDS,
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
  const list = smsCountries();
  const ids = list.map((c) => c.id);

  it("offers exactly the countries enabled in Clerk, US and Canada included", () => {
    expect(ids).toContain("US");
    expect(ids).toContain("CA");
    expect(ids).toContain("GB");
    expect(ids).toContain("FR");
    expect(ids).toContain("IE");
    expect(ids).not.toContain("AU");
    expect(ids).not.toContain("IN");
    expect(list).toHaveLength(SMS_COUNTRY_IDS.length);
  });
  it("every configured code is a real country in the picker", () => {
    for (const id of SMS_COUNTRY_IDS) expect(ids).toContain(id);
  });
  it("compares calling codes, as Clerk does", () => {
    const us = list.filter((c) => c.id === "US");
    expect(isSmsSupported("+14155552671", us)).toBe(true);
    expect(isSmsSupported("+12425551234", us)).toBe(true); // Bahamas shares +1
    expect(isSmsSupported("+447700900123", us)).toBe(false);
    expect(isSmsSupported("+61412345678", list)).toBe(false); // Australia not enabled
  });
});
