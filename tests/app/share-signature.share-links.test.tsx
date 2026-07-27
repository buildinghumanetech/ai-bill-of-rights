/**
 * `<ShareSignature />` — the "Share your signature" box on the signer's own
 * public page — was a THIRD hand-rolled copy of the three share hrefs, after
 * the post-sign modal and the confirmation email were consolidated onto
 * `shareHrefs`. Its own comment conceded the duplication, and it had already
 * drifted in two ways that reach real recipients:
 *
 *   - its X href stuffed the share URL inside `text=` with no `&url=` param,
 *     so X had nothing to unfurl and rendered no link card;
 *   - its `mailto:` subject was "I signed the AI Bill of Rights" rather than
 *     the shared `SHARE_EMAIL_SUBJECT`, so two share surfaces sent different
 *     subject lines for the same action.
 *
 * These tests pin the SHAPE of each href — the parts a copy is free to get
 * wrong — not the copy inside it. Re-inlining the construction here brings
 * both drifts straight back and turns them red.
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ShareSignature } from "@/components/ShareSignature";
import {
  REF_PARAM,
  CHANNEL_PARAM,
  SHARE_EMAIL_SUBJECT,
} from "@/lib/share/urls";

const SIGNER_ID = "eeeb0d40-7bee-4bc9-8808-fecb955a8db0";
const ORIGIN = "https://ai-for-people.org";
const SIGNER_PAGE = `${ORIGIN}/signatories/${SIGNER_ID}`;

const html = renderToStaticMarkup(
  <ShareSignature signerId={SIGNER_ID} siteUrl={ORIGIN} />,
);

/** Every href in the rendered box, HTML-unescaped enough to compare queries. */
const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) =>
  m[1].replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'"),
);

function hrefStartingWith(prefix: string): string {
  const found = hrefs.find((h) => h.startsWith(prefix));
  expect(found, `no href starting with ${prefix}`).toBeDefined();
  return found!;
}

describe("ShareSignature share hrefs", () => {
  it("puts the share URL in X's own &url= param, not buried in the text", () => {
    // The drift that mattered: without `&url=`, X has nothing to unfurl and
    // the post renders as a bare sentence with no link card.
    const twitter = hrefStartingWith("https://twitter.com/intent/tweet");
    const url = decodeURIComponent(/[?&]url=([^&]+)/.exec(twitter)![1]);
    expect(url).toBe(`${SIGNER_PAGE}?${REF_PARAM}=${SIGNER_ID}&${CHANNEL_PARAM}=x`);
  });

  it("tags the LinkedIn href with ref and via=linkedin", () => {
    const linkedin = hrefStartingWith(
      "https://www.linkedin.com/sharing/share-offsite/",
    );
    const url = decodeURIComponent(/[?&]url=([^&]+)/.exec(linkedin)![1]);
    expect(url).toBe(
      `${SIGNER_PAGE}?${REF_PARAM}=${SIGNER_ID}&${CHANNEL_PARAM}=linkedin`,
    );
  });

  it("uses the one shared email subject, so both surfaces say the same thing", () => {
    const mailto = hrefStartingWith("mailto:");
    const subject = decodeURIComponent(/[?&]subject=([^&]+)/.exec(mailto)![1]);
    expect(subject).toBe(SHARE_EMAIL_SUBJECT);
  });

  it("tags the mailto body with ref and via=email", () => {
    const mailto = hrefStartingWith("mailto:");
    const body = decodeURIComponent(/[?&]body=([^&]+)/.exec(mailto)![1]);
    expect(body).toContain(
      `${SIGNER_PAGE}?${REF_PARAM}=${SIGNER_ID}&${CHANNEL_PARAM}=email`,
    );
  });

  it("renders the copyable link tagged with the copy channel", () => {
    expect(html).toContain(
      `${SIGNER_PAGE}?${REF_PARAM}=${SIGNER_ID}&amp;${CHANNEL_PARAM}=copy`,
    );
  });

  it("leaves no untagged bare signer-page URL anywhere in the box", () => {
    // Same guard the confirmation email carries. Every link in this box goes
    // to a third party, so an untagged one is a leak with no carve-out.
    const bare = new RegExp(
      `${SIGNER_PAGE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![?%])`,
    );
    expect(bare.test(html.replace(/&amp;/g, "&"))).toBe(false);
  });
});
