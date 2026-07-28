/**
 * `<ShareSignature />` — the "Share your signature" box on the signer's own
 * public page — was a hand-rolled copy of BOTH the three share hrefs and the
 * share pitch, after the post-sign modal and the confirmation email were
 * consolidated onto `shareHrefs` / `buildShareText`. Its own comment conceded
 * the duplication, and it had already drifted in ways that reach real
 * recipients:
 *
 *   - its X href stuffed the share URL inside `text=` with no `&url=` param,
 *     so X had nothing to unfurl and rendered no link card;
 *   - its `mailto:` subject was "I signed the AI Bill of Rights" rather than
 *     the shared `SHARE_EMAIL_SUBJECT`, so two share surfaces sent different
 *     subject lines for the same action;
 *   - its pitch was a hardcoded string that never saw `whyISigned`, so the
 *     signer's OWN statement was silently dropped from the share surface the
 *     signer is most likely to use — and never measured against X's weighted
 *     character limit either.
 *
 * These tests pin the SHAPE of each href — the parts a copy is free to get
 * wrong — plus the two properties of the copy that a re-inlined constant
 * cannot satisfy: it contains the signer's sentence, and the X variant fits.
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ShareSignature } from "@/components/ShareSignature";
import {
  REF_PARAM,
  CHANNEL_PARAM,
  SHARE_EMAIL_SUBJECT,
} from "@/lib/share/urls";
import {
  GENERIC_SHARE_TEXT,
  X_POST_LIMIT,
  xPostWeight,
} from "@/lib/share/share-text";

const SIGNER_ID = "eeeb0d40-7bee-4bc9-8808-fecb955a8db0";
const ORIGIN = "https://ai-for-people.org";
const SIGNER_PAGE = `${ORIGIN}/signatories/${SIGNER_ID}`;

/**
 * Every href in a rendered box, HTML-unescaped enough to compare queries.
 *
 * Defaults to `null` rather than leaving the parameter optional: the prop it
 * forwards is required now, so an omitted argument has to become an explicit
 * "this signer wrote nothing" here rather than an `undefined` the component
 * would have to tolerate.
 */
function renderHrefs(whyISigned: string | null = null): {
  html: string;
  hrefs: string[];
} {
  const html = renderToStaticMarkup(
    <ShareSignature
      signerId={SIGNER_ID}
      siteUrl={ORIGIN}
      whyISigned={whyISigned}
    />,
  );
  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) =>
    m[1].replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'"),
  );
  return { html, hrefs };
}

const { html, hrefs } = renderHrefs();

function hrefStartingWith(prefix: string, from: string[] = hrefs): string {
  const found = from.find((h) => h.startsWith(prefix));
  expect(found, `no href starting with ${prefix}`).toBeDefined();
  return found!;
}

/** The value of a query param, or null when the param isn't there at all. */
function param(href: string, name: string): string | null {
  const m = new RegExp(`[?&]${name}=([^&]*)`).exec(href);
  return m ? decodeURIComponent(m[1]) : null;
}

describe("ShareSignature share hrefs", () => {
  it("puts the share URL in X's own &url= param, not buried in the text", () => {
    // The drift that mattered: without `&url=`, X has nothing to unfurl and
    // the post renders as a bare sentence with no link card.
    const twitter = hrefStartingWith("https://twitter.com/intent/tweet");
    const url = param(twitter, "url");
    expect(url, "X href has no &url= param at all").not.toBeNull();
    expect(url).toBe(`${SIGNER_PAGE}?${REF_PARAM}=${SIGNER_ID}&${CHANNEL_PARAM}=x`);
  });

  it("keeps a real pitch in X's text=, with the URL only in &url=", () => {
    // Half of the original drift was never pinned: re-inlining the URL into
    // `text=` while KEEPING `&url=` posts the link twice, and shipping an
    // empty `text=` posts a bare link with no pitch at all. Both stayed green
    // against a check that only looked at `&url=`.
    const twitter = hrefStartingWith("https://twitter.com/intent/tweet");
    const text = param(twitter, "text");
    expect(text, "X href has no text= param at all").not.toBeNull();
    expect(text!.trim().length).toBeGreaterThan(0);
    expect(text).not.toContain(SIGNER_PAGE);
    expect(text).not.toContain("ai-for-people.org");
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

  it("falls back to the one shared generic pitch when there is no statement", () => {
    // The hardcoded copy this box used to carry opened "I signed" and closed
    // with a full stop; `GENERIC_SHARE_TEXT` opens "I just signed" and closes
    // with a colon. Two surfaces, one action, one sentence.
    const twitter = hrefStartingWith("https://twitter.com/intent/tweet");
    expect(param(twitter, "text")).toBe(GENERIC_SHARE_TEXT);
  });
});

/**
 * The reason the "why I signed" feature exists is that a personal sentence
 * converts better than boilerplate — and this box is the share surface a signer
 * is most likely to use. A pitch that cannot see `whyISigned` defeats the
 * feature exactly where it should work hardest, which is what the hardcoded
 * constant did, silently and on every channel.
 */
describe("ShareSignature share copy carries the signer's own statement", () => {
  const STATEMENT =
    "My daughter will grow up talking to these systems and I want her to have rights when she does.";

  it("leads every channel's copy with the signer's sentence", () => {
    const { hrefs: withStatement } = renderHrefs(STATEMENT);

    const twitter = hrefStartingWith(
      "https://twitter.com/intent/tweet",
      withStatement,
    );
    const tweetText = param(twitter, "text")!;
    expect(tweetText).toContain(STATEMENT);
    expect(tweetText).not.toBe(GENERIC_SHARE_TEXT);

    // The mailto body is the second surface the copy reaches; the LinkedIn
    // endpoint carries no text at all, by design.
    const mailto = hrefStartingWith("mailto:", withStatement);
    expect(param(mailto, "body")).toContain(STATEMENT);
  });

  it("keeps the X post inside X's weighted limit, however heavy the statement", () => {
    // `.length` is not the measure that matters: X charges 2 per code point
    // outside its four light ranges, so a statement of CJK or emoji costs
    // double. A hand-rolled pitch never went near `truncateToWeight` — this is
    // the assertion that notices when one comes back.
    for (const statement of [
      STATEMENT,
      // 200 chars — the server-side cap — of pure double-weight text.
      "私たちの権利を守るために署名しました。".repeat(11),
      "🌍".repeat(200),
    ]) {
      const { hrefs: heavy } = renderHrefs(statement);
      const twitter = hrefStartingWith(
        "https://twitter.com/intent/tweet",
        heavy,
      );
      const text = param(twitter, "text")!;
      expect(
        xPostWeight(text),
        `X post over budget for statement: ${statement.slice(0, 24)}…`,
      ).toBeLessThanOrEqual(X_POST_LIMIT);
    }
  });
});
