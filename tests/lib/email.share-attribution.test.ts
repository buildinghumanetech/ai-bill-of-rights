import { describe, it, expect } from "vitest";
import { signConfirmation, signInvitation } from "@/lib/email/templates";
import {
  REF_PARAM,
  CHANNEL_PARAM,
  homeShareUrl,
  signerShareUrl,
} from "@/lib/share/urls";

/**
 * The confirmation email is the single highest-volume share surface on the
 * site — it goes to 100% of signers. Every link in it that a THIRD PARTY will
 * click must carry `?ref=<signerId>`, or the referral graph records nothing
 * and channel conversion reads as "email barely converts" purely because the
 * links were never tagged. Every link the SIGNER clicks must not, or their own
 * click burns their 30-day first-touch referral slot.
 *
 * These tests pin the tagging itself, not the copy. The `mailto:` encoding
 * guard lives once, on `shareHrefs`, in tests/lib/share-urls.test.ts.
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

  /**
   * The distinction the next three tests exist to pin, because it is subtle
   * and easy to "fix" backwards:
   *
   *   share buttons  → go to a THIRD PARTY  → carry `ref` + `via`
   *   "view mine"    → clicked by the SIGNER → carry `via` ONLY
   *
   * A `ref` on a self-directed link is not bad data (the database rejects
   * self-referral) — it is a swallowed referral. The proxy stamps a
   * first-touch cookie that lives 30 days, so the signer's own click would
   * occupy the slot a genuine later referral needed.
   */
  it("channels the plain-text 'view your signature page' link but never self-refs it", () => {
    const line = /View your public signature page: (\S+)/.exec(tpl.text)![1];
    expect(line).toContain(`${CHANNEL_PARAM}=confirmation-email`);
    expect(line).not.toContain(`${REF_PARAM}=`);
  });

  it("channels the 'View My Signature' HTML CTA but never self-refs it", () => {
    const cta = hrefs(tpl.html)
      .map(unesc)
      .find((h) => h.startsWith(SIGNER_PAGE));
    expect(cta).toBeDefined();
    expect(cta).toContain(`${CHANNEL_PARAM}=confirmation-email`);
    expect(cta).not.toContain(`${REF_PARAM}=`);
  });

  it("still refs the three share buttons — those really do go to someone else", () => {
    // The mirror image of the two tests above. Stripping `ref` from the
    // self-directed links must not be over-applied to the share buttons,
    // which is the whole viral loop.
    for (const [pattern, channel] of [
      [/twitter\.com\/intent\/tweet\?text=[^&\s]*&url=([^\s"]+)/, "x"],
      [/linkedin\.com\/sharing\/share-offsite\/\?url=([^\s"]+)/, "linkedin"],
      [/mailto:\?subject=[^&\s]*&body=([^\s"]+)/, "email"],
    ] as const) {
      const target = decodeURIComponent(pattern.exec(tpl.text)![1]);
      expect(target).toContain(`${REF_PARAM}=${SIGNER_ID}`);
      expect(target).toContain(`${CHANNEL_PARAM}=${channel}`);
    }
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

/**
 * The invitation email — the highest-INTENT share surface on the site, and
 * until recently the only one carrying no attribution at all.
 *
 * The mirror of "still refs the three share buttons" above: BOTH links here go
 * to a third party (the invitee), so both must carry `ref` + `via=invite`.
 * There is no self-directed link to exempt, so a bare URL anywhere in the body
 * is a leak rather than a deliberate carve-out.
 *
 * The tagging itself is done at the call site, in `sendInvitationsAction` —
 * these cases pin that the TEMPLATE ships both tagged URLs through un-mangled
 * and leaves no naked copy beside them. That the action actually tags them is
 * pinned against the real action in tests/server/invite.share-attribution.
 */
describe("signInvitation share attribution", () => {
  const INVITER_ID = "c06cbb39-bcb6-4b3c-bd22-e0154a4c7322";
  const ORIGIN = "https://ai-for-people.org";

  const tpl = signInvitation({
    inviterName: "Ada Lovelace",
    inviterPageUrl: signerShareUrl(ORIGIN, INVITER_ID, "invite"),
    siteUrl: homeShareUrl(ORIGIN, INVITER_ID, "invite"),
  });

  /** Every absolute site URL in the body, in order of appearance. */
  const links = [...tpl.text.matchAll(/https:\/\/ai-for-people\.org\S*/g)].map(
    (m) => m[0],
  );

  it("renders both links, each carrying ref and via=invite", () => {
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link).toContain(`${REF_PARAM}=${INVITER_ID}`);
      expect(link).toContain(`${CHANNEL_PARAM}=invite`);
    }
  });

  it("keeps the inviter's signature page and the homepage as distinct links", () => {
    expect(links.some((l) => l.includes(`/signatories/${INVITER_ID}?`))).toBe(
      true,
    );
    expect(links.some((l) => !l.includes("/signatories/"))).toBe(true);
  });

  it("leaves no untagged bare signer-page URL in the body", () => {
    // Escape the URL first, THEN append the lookahead — escaping the whole
    // pattern would neuter `(?![?%])` and the assertion would pass on anything.
    const page = `${ORIGIN}/signatories/${INVITER_ID}`.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&",
    );
    expect(new RegExp(`${page}(?![?%])`).test(tpl.text)).toBe(false);
  });
});
