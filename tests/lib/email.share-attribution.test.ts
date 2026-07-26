import { describe, it, expect } from "vitest";
import { signConfirmation } from "@/lib/email/templates";
import { REF_PARAM, CHANNEL_PARAM } from "@/lib/share/urls";

/**
 * The confirmation email is the single highest-volume share surface on the
 * site — it goes to 100% of signers. Every link in it that points back at the
 * signer's page must carry `?ref=<signerId>`, or the referral graph records
 * nothing and channel conversion reads as "email barely converts" purely
 * because the links were never tagged.
 *
 * These tests pin the tagging itself, not the copy.
 */

const SIGNER_ID = "eeeb0d40-7bee-4bc9-8808-fecb955a8db0";
const SIGNER_PAGE = `https://ai-for-people.org/signatories/${SIGNER_ID}`;

function render(signerId: string | null = SIGNER_ID) {
  return signConfirmation({
    displayName: "Ada Lovelace",
    version: "0.0.1",
    signerPageUrl: SIGNER_PAGE,
    revokeUrl: "https://ai-for-people.org/account/revoke",
    signatureNumber: 42,
    totalSignatures: 137,
    signerId,
  });
}

/** Pull every https/mailto href out of the HTML body. */
function hrefs(html: string): string[] {
  return [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
}

/** HTML-unescape just enough to compare query strings. */
function unesc(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"');
}

describe("signConfirmation share attribution", () => {
  const tpl = render();

  it("tags the X share link with ref and via", () => {
    const target = decodeURIComponent(
      /twitter\.com\/intent\/tweet\?text=[^&\s]*&url=([^\s"]+)/.exec(
        tpl.text,
      )![1],
    );
    expect(target).toContain(`${REF_PARAM}=${SIGNER_ID}`);
    expect(target).toContain(`${CHANNEL_PARAM}=x`);
  });

  it("tags the LinkedIn share link with ref and via", () => {
    const target = decodeURIComponent(
      /linkedin\.com\/sharing\/share-offsite\/\?url=([^\s"]+)/.exec(tpl.text)![1],
    );
    expect(target).toContain(`${REF_PARAM}=${SIGNER_ID}`);
    expect(target).toContain(`${CHANNEL_PARAM}=linkedin`);
  });

  it("tags the email share link with ref and via", () => {
    const body = decodeURIComponent(/mailto:\?subject=[^&\s]*&body=([^\s"]+)/.exec(tpl.text)![1]);
    expect(body).toContain(`${REF_PARAM}=${SIGNER_ID}`);
    expect(body).toContain(`${CHANNEL_PARAM}=email`);
  });

  it("tags the plain-text 'view your signature page' link", () => {
    // The bare, untagged URL must not appear on its own line — a click from
    // the email body is a share-surface click and has to be attributable.
    const line = /View your public signature page: (\S+)/.exec(tpl.text)![1];
    expect(line).toContain(`${REF_PARAM}=${SIGNER_ID}`);
    expect(line).toContain(`${CHANNEL_PARAM}=confirmation-email`);
  });

  it("tags the 'View My Signature' HTML CTA", () => {
    const cta = hrefs(tpl.html)
      .map(unesc)
      .find((h) => h.startsWith(SIGNER_PAGE));
    expect(cta).toBeDefined();
    expect(cta).toContain(`${REF_PARAM}=${SIGNER_ID}`);
    expect(cta).toContain(`${CHANNEL_PARAM}=confirmation-email`);
  });

  it("leaves no untagged bare signer-page URL anywhere in the email", () => {
    // `SIGNER_PAGE` followed by anything other than `?` means a naked link.
    for (const body of [tpl.text, unesc(tpl.html)]) {
      const bare = new RegExp(
        `${SIGNER_PAGE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![?%])`,
      );
      expect(bare.test(body)).toBe(false);
    }
  });

  it("mailto body keeps literal spaces percent-encoded, never '+'", () => {
    // RFC 6068 reads `+` in a mailto as a literal plus, so a form-encoded
    // body arrives reading "I+just+signed". Regression guard.
    const raw = /mailto:\?subject=[^&\s]*&body=([^\s"]+)/.exec(tpl.text)![1];
    expect(raw).not.toContain("+");
    expect(raw).toContain("%20");
  });

  it("degrades to unattributed links when no signerId is supplied", () => {
    const anon = render(null);
    const target = decodeURIComponent(
      /twitter\.com\/intent\/tweet\?text=[^&\s]*&url=([^\s"]+)/.exec(
        anon.text,
      )![1],
    );
    expect(target).not.toContain(`${REF_PARAM}=`);
    // The channel still rides along — an un-refed share is still a channel we
    // want to be able to compare.
    expect(target).toContain(`${CHANNEL_PARAM}=x`);
  });
});
