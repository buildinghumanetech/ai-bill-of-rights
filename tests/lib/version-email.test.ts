import { describe, expect, it } from "vitest";
import {
  greetingName,
  shareDraftHref,
  versionEmail,
  VERSION_EMAIL_CTA,
  VERSION_EMAIL_SHARE_CTA,
} from "@/lib/email/version-email";

const WHAT_CHANGED = "https://theaibill.org/v/0.1.0#what-changed";
const SHARE = "https://theaibill.org/s/abc2345?via=email";
const DRAFT =
  "mailto:?subject=I%20signed%20The%20People's%20AI%20Bill%20of%20Rights&body=I%20just%20added%20my%20name%20to%20The%20People's%20AI%20Bill%20of%20Rights%2C%20a%20people's%20demand%20for%20how%20AI%20companies%20treat%20us.%20It%20takes%20a%20minute.%20Will%20you%20sign%20too%3F%20https%3A%2F%2Ftheaibill.org%2Fs%2Fabc2345%3Fvia%3Demail";
const DRAFT_HTML = DRAFT.replace(/&/g, "&amp;");
const UNSUB = "https://theaibill.org/unsubscribe/tok123";

const BASE = {
  name: "Ada Lovelace",
  signerNumber: 12,
  version: "0.1.0",
  summary:
    "adds Freedom From Algorithmic Discrimination and A Right to Safe, Tested Systems, and revises the wording of Articles 1, 4, 5 and 7.",
  relaunch: true,
  siteOrigin: "https://theaibill.org",
  shareUrl: SHARE,
  unsubscribeUrl: UNSUB,
};

describe("greetingName", () => {
  it("is the first word of the display name", () => {
    expect(greetingName("Ada Lovelace")).toBe("Ada");
    expect(greetingName("  Grace  ")).toBe("Grace");
  });

  it("greets plainly for a blank name, an initial, a mask or an email", () => {
    for (const name of [null, undefined, "", "   ", "E", "E.", "E. Anderson", "E****", "ada@example.com"]) {
      expect(greetingName(name)).toBeNull();
    }
  });
});

describe("the relaunch email", () => {
  const { subject, text, html } = versionEmail(BASE);

  it("is exactly the approved copy", () => {
    expect(subject).toBe("We've updated The People's AI Bill of Rights: v0.1.0");
    expect(text).toBe(
      [
        "Hi Ada, thanks for being signer #12 on The People's AI Bill of Rights.",
        "You asked to hear about updates. We've created v0.1.0, which adds Freedom From Algorithmic Discrimination and A Right to Safe, Tested Systems, and revises the wording of Articles 1, 4, 5 and 7.",
        `See the update:\n${WHAT_CHANGED}`,
        `Spread the word:\n${DRAFT}`,
        "Thanks!\nErika",
        `You're getting this because you signed The People's AI Bill of Rights and asked to hear about new versions.\nUnsubscribe: ${UNSUB}`,
      ].join("\n\n"),
    );
  });

  it("has no em or en dashes anywhere", () => {
    for (const s of [subject, text, html]) {
      expect(s).not.toMatch(/[—–]|&mdash;|&ndash;/);
    }
  });

  it("drops the date, new-home and plain-URL lines", () => {
    expect(text).not.toMatch(/new home|published|July/);
    // In the HTML, URLs appear only as link targets, never as visible text.
    expect(html.replace(/href="[^"]*"/g, "")).not.toMatch(/https:|mailto:/);
  });

  it("never suggests the earlier signature lapsed", () => {
    expect(text).not.toMatch(/re-?sign|expire|invalid|no longer|lapse|renew/i);
  });

  it("links the two buttons to what changed and to a share draft", () => {
    expect(VERSION_EMAIL_CTA).toBe("See the update");
    expect(VERSION_EMAIL_SHARE_CTA).toBe("Spread the word");
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(hrefs)).toEqual(new Set([WHAT_CHANGED, DRAFT_HTML, UNSUB]));
    const button = (label: string) =>
      html.match(new RegExp(`<a [^>]*>${label}</a>`))?.[0] ?? "";
    expect(button("See the update")).toContain(`href="${WHAT_CHANGED}"`);
    expect(button("Spread the word")).toContain(`href="${DRAFT_HTML}"`);
  });

  it("makes See the update a solid blue pill and Spread the word a blue outline pill", () => {
    const style = (label: string) =>
      html.match(new RegExp(`<a [^>]*style="([^"]*)"[^>]*>${label}</a>`))?.[1] ?? "";
    const shared = [
      "border:1.5px solid #2563eb",
      "border-radius:999px",
      "font-weight:600",
      "font-size:16px",
      "display:inline-block",
      "font-family:Geist, -apple-system, Helvetica, Arial, sans-serif",
    ];
    for (const rule of [...shared, "background:#2563eb", "color:#ffffff"]) {
      expect(style("See the update")).toContain(rule);
    }
    for (const rule of [...shared, "background:#ffffff", "color:#2563eb"]) {
      expect(style("Spread the word")).toContain(rule);
    }
  });

  it("sets the buttons side by side, wrapping to a stack on narrow screens", () => {
    const nonMso = html.slice(html.indexOf("<!--[if !mso]><!-->"), html.indexOf("<!--<![endif]-->"));
    const cells = nonMso.match(/<div style="display:inline-block;[^"]*">\s*<table role="presentation"/g);
    expect(cells).toHaveLength(2);
    expect(html).not.toMatch(/width:100%|width="100%"/);
  });

  it("gives Outlook a VML pill per button, wide enough for each label", () => {
    const mso = html.slice(html.indexOf("<!--[if mso]>"), html.indexOf("<![endif]-->"));
    const pills = [...mso.matchAll(/<v:roundrect [^>]*style="[^"]*width:(\d+)px;"[^>]*>[\s\S]*?<center[^>]*>([^<]+)<\/center>/g)];
    expect(pills.map((m) => m[2])).toEqual(["See the update", "Spread the word"]);
    // Arial Bold 16px: 114px and 126px of text, plus 24px padding each side.
    expect(Number(pills[0][1])).toBeGreaterThanOrEqual(114 + 48);
    expect(Number(pills[1][1])).toBeGreaterThanOrEqual(126 + 48);
    expect(mso).toContain('fillcolor="#2563eb"');
    expect(mso).toContain('fillcolor="#ffffff"');
    expect(mso.match(/arcsize="50%"/g)).toHaveLength(2);
  });

  it("keeps the small gray unsubscribe footer", () => {
    expect(html).toMatch(
      /<p style="[^"]*font-size:13px[^"]*color:#71717a[^"]*">You're getting this because you signed The People's AI Bill of Rights and asked to hear about new versions\. <a href="https:\/\/theaibill\.org\/unsubscribe\/tok123"[^>]*>Unsubscribe<\/a>/,
    );
  });

  it("uses only the site palette: white, near-black, gray, blue", () => {
    const colors = new Set(html.toLowerCase().match(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/g));
    expect([...colors].sort()).toEqual(["#09090b", "#2563eb", "#71717a", "#ffffff"]);
    expect(html).not.toMatch(/green|purple|violet|emerald/i);
  });

  it("calls it The People's AI Bill of Rights everywhere", () => {
    for (const s of [subject, text, html]) {
      expect(s.replace(/The People's AI Bill of Rights/g, "")).not.toContain("AI Bill of Rights");
    }
  });
});

describe("shareDraftHref", () => {
  it("opens a draft with no To, the approved subject, and the body with their link", () => {
    const href = shareDraftHref(SHARE);
    expect(href).toBe(DRAFT);
    expect(href.startsWith("mailto:?")).toBe(true);
    const params = new URLSearchParams(href.slice("mailto:?".length));
    expect(params.get("subject")).toBe("I signed The People's AI Bill of Rights");
    expect(params.get("body")).toBe(
      "I just added my name to The People's AI Bill of Rights, a people's demand for how AI companies treat us. It takes a minute. Will you sign too? https://theaibill.org/s/abc2345?via=email",
    );
  });

  it("never form-encodes spaces as +, which mail apps read literally", () => {
    expect(shareDraftHref(SHARE)).not.toContain("+");
  });

  it("carries the bare site when there's no short link", () => {
    expect(shareDraftHref("https://theaibill.org")).toMatch(/too%3F%20https%3A%2F%2Ftheaibill\.org$/);
  });
});

describe("variations", () => {
  it("greets plainly on the same line without a usable name", () => {
    const plain = versionEmail({ ...BASE, name: "E." });
    expect(plain.text.startsWith("Hi, thanks for being signer #12 on The People's AI Bill of Rights.\n\n")).toBe(true);
    expect(plain.html).toContain(">Hi, thanks for being signer #12 on");
  });

  it("thanks plainly without a number", () => {
    const plain = versionEmail({ ...BASE, signerNumber: null });
    expect(plain.text.startsWith("Hi Ada, thanks for signing The People's AI Bill of Rights.")).toBe(true);
    expect(plain.text).not.toContain("signer #");
  });

  it("writes large signer numbers with a comma", () => {
    expect(versionEmail({ ...BASE, signerNumber: 1234 }).text).toContain("signer #1,234 on");
  });

  it("gives a version update the same subject and its changelog as sentences", () => {
    const update = versionEmail({
      ...BASE,
      relaunch: false,
      version: "0.2.0",
      summary: "Adds Article 12.",
    });
    expect(update.subject).toBe("We've updated The People's AI Bill of Rights: v0.2.0");
    expect(update.text).toContain("We've created v0.2.0. Adds Article 12.");
  });
});
