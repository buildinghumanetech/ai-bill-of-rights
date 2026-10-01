import { describe, expect, it } from "vitest";
import { signInvitation } from "@/lib/email/templates";

const base = {
  inviterName: "Ada Lovelace",
  inviterPageUrl: "https://theaibill.org/s/abc123?via=invite",
  readItUrl: "https://theaibill.org/?ref=r-1&via=invite",
  logoUrl: "https://theaibill.org/images/email/torch-gold.png",
};

describe("signInvitation", () => {
  const tpl = signInvitation(base);

  it("uses the full People's AI Bill of Rights name everywhere", () => {
    expect(tpl.subject).toBe(
      "Ada Lovelace invited you to sign The People's AI Bill of Rights",
    );
    expect(tpl.text).toContain("just signed The People's AI Bill of Rights");
    expect(tpl.text).toContain("— The People's AI Bill of Rights project");
    // No leftover short name in either part.
    for (const part of [tpl.subject, tpl.text, tpl.html.replace(/&#39;/g, "'")]) {
      expect(part).not.toMatch(/(?<!People's )AI Bill of Rights/);
    }
  });

  it("html carries the logo as an absolute PNG URL", () => {
    expect(tpl.html).toContain(`src="${base.logoUrl}"`);
    expect(base.logoUrl.endsWith(".png")).toBe(true);
  });

  it("html keeps both attribution-tagged links", () => {
    expect(tpl.html).toContain(`href="${base.readItUrl.replace(/&/g, "&amp;")}"`);
    expect(tpl.html).toContain(base.inviterPageUrl);
  });

  it("escapes the inviter's name in html", () => {
    const evil = signInvitation({ ...base, inviterName: "<script>x</script>" });
    expect(evil.html).not.toContain("<script>");
  });

  it("omits the logo when none is given", () => {
    const { logoUrl: _omit, ...rest } = base;
    expect(signInvitation(rest).html).not.toContain("<img");
  });
});
