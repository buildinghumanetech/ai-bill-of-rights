import { describe, expect, it } from "vitest";
import { longDate, versionEmail, VERSION_EMAIL_CTA } from "@/lib/email/version-email";

const BASE = {
  firstName: "Ada",
  signerNumber: 12,
  version: "0.1.0",
  publishedAt: "2026-07-24",
  summary: "It adds two articles.",
  signedVersion: "0.0.1",
  relaunch: true,
  siteOrigin: "https://theaibill.org",
  unsubscribeUrl: "https://theaibill.org/unsubscribe/tok123",
};

describe("longDate", () => {
  it("writes dates out in full", () => {
    expect(longDate("2026-07-24")).toBe("Friday, July 24th");
    expect(longDate("2026-09-24")).toBe("Thursday, September 24th");
    expect(longDate("2026-09-01")).toBe("Tuesday, September 1st");
    expect(longDate("2026-09-02")).toBe("Wednesday, September 2nd");
    expect(longDate("2026-09-03")).toBe("Thursday, September 3rd");
    expect(longDate("2026-09-11")).toBe("Friday, September 11th");
    expect(longDate("2026-09-22")).toBe("Tuesday, September 22nd");
  });
});

describe("versionEmail", () => {
  const { subject, text, html } = versionEmail(BASE);

  it("has no em or en dashes anywhere", () => {
    for (const s of [subject, text, html]) {
      expect(s).not.toMatch(/[—–]|&mdash;|&ndash;/);
    }
  });

  it("has exactly one call to action, to what changed", () => {
    expect(text).toContain(`${VERSION_EMAIL_CTA}:\nhttps://theaibill.org/v/0.1.0#what-changed`);
    expect(text.split(VERSION_EMAIL_CTA)).toHaveLength(2);
    expect(html).toContain('href="https://theaibill.org/v/0.1.0#what-changed"');
  });

  it("informs, and never suggests the earlier signature lapsed", () => {
    expect(text).toContain("Your signature on v0.0.1 stands, and you're still counted.");
    expect(text).not.toMatch(/re-?sign|expire|invalid|no longer|lapse|renew/i);
  });

  it("greets by first name, gives their number and the date in full", () => {
    expect(text.startsWith("Hi Ada,")).toBe(true);
    expect(text).toContain("You're signer #12.");
    expect(text).toContain("On Friday, July 24th, we published a new version, v0.1.0.");
  });

  it("signs off as Erika and carries an unsubscribe link", () => {
    expect(text).toContain("Erika Anderson");
    expect(text).toContain("Unsubscribe: https://theaibill.org/unsubscribe/tok123");
    expect(html).toContain('href="https://theaibill.org/unsubscribe/tok123"');
  });

  it("announces the new home only in the relaunch", () => {
    expect(text).toContain("The site has a new home too: theaibill.org.");
    const update = versionEmail({ ...BASE, relaunch: false, version: "0.2.0" });
    expect(update.text).not.toContain("new home");
    expect(update.subject).toBe("Version 0.2.0 of The People's AI Bill of Rights is out");
  });

  it("calls it The People's AI Bill of Rights everywhere", () => {
    expect(subject).toBe("A new version of The People's AI Bill of Rights");
    expect(text).toContain("Thank you for signing The People's AI Bill of Rights.");
    expect(text).toContain("because you signed The People's AI Bill of Rights");
    for (const s of [subject, text, html]) {
      expect(s.replace(/The People's AI Bill of Rights/g, "")).not.toContain("AI Bill of Rights");
    }
  });

  it("greets plainly with no name, and leaves out a missing number", () => {
    const plain = versionEmail({ ...BASE, firstName: null, signerNumber: null });
    expect(plain.text.startsWith("Hi,")).toBe(true);
    expect(plain.text).not.toContain("signer #");
  });
});
