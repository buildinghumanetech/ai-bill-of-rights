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
    expect(VERSION_EMAIL_CTA).toBe("See the update");
    expect(text).toContain("See the update:\nhttps://theaibill.org/v/0.1.0#what-changed");
    expect(text.split(VERSION_EMAIL_CTA)).toHaveLength(2);
    // Every link but the unsubscribe goes to what changed: the button, its
    // Outlook twin, and the plain-text fallback under it.
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(hrefs)).toEqual(
      new Set([
        "https://theaibill.org/v/0.1.0#what-changed",
        "https://theaibill.org/unsubscribe/tok123",
      ]),
    );
  });

  it("uses a bulletproof pill button styled like the site", () => {
    // Table-based for Gmail and Apple Mail, VML for Outlook on Windows.
    expect(html).toMatch(/<table role="presentation"[^>]*>\s*<tr>\s*<td[^>]*bgcolor="#2563eb"/);
    expect(html).toContain('<v:roundrect');
    expect(html).toContain('arcsize="50%"');
    expect(html).toContain('fillcolor="#2563eb"');
    const a = html.match(/<a [^>]*>See the update<\/a>/)?.[0] ?? "";
    for (const rule of [
      "background:#2563eb",
      "color:#ffffff",
      "font-weight:600",
      "font-size:16px",
      "border-radius:999px",
      "padding:12px 24px",
      "display:inline-block",
      "font-family:Geist, -apple-system, Helvetica, Arial, sans-serif",
    ]) {
      expect(a).toContain(rule);
    }
    // Sized to its text, not full width.
    expect(html).not.toMatch(/width:100%|width="100%"/);
  });

  it("puts a small gray plain-text link under the button", () => {
    const after = html.slice(html.indexOf("<!--<![endif]-->"));
    expect(after).toMatch(
      /<p style="[^"]*font-size:13px[^"]*color:#71717a[^"]*"><a href="https:\/\/theaibill\.org\/v\/0\.1\.0#what-changed"[^>]*>https:\/\/theaibill\.org\/v\/0\.1\.0#what-changed<\/a>/,
    );
  });

  it("uses only the site palette: white, near-black, gray, blue", () => {
    const colors = new Set(html.toLowerCase().match(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/g));
    expect([...colors].sort()).toEqual(["#09090b", "#2563eb", "#71717a", "#ffffff"]);
    expect(html).not.toMatch(/green|purple|violet|emerald/i);
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
