/**
 * The post-signature share step is shown to every signer at the moment of peak
 * motivation — it is the highest-intent share surface on the site. Every link
 * it renders must go through `signerShareUrl` so `?ref=`/`?via=` can never
 * silently fall off one of the buttons.
 *
 * `buildPostSignShareLinks` is the pure core of that step, exported from the
 * modal precisely so it can be pinned here without driving a Clerk-backed
 * component through three steps of state.
 *
 * The three hrefs themselves are assembled by `shareHrefs`, shared with the
 * confirmation email; the `mailto:` `+`-vs-`%20` guard lives there, once, in
 * tests/lib/share-urls.test.ts.
 */

import { describe, expect, it, vi } from "vitest";

// SignModal is a client component whose imports reach Clerk, the router and
// several server actions. None of that is what these tests are about.
vi.mock("@clerk/nextjs", () => ({
  useClerk: () => ({}),
  useSignIn: () => ({}),
  useSignUp: () => ({}),
  useUser: () => ({}),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({}) }));
vi.mock("@/server/actions/sign-from-modal", () => ({
  recordSignatureFromModal: vi.fn(),
  createSignerFromModal: vi.fn(),
}));
vi.mock("@/server/actions/invite", () => ({ sendInvitationsAction: vi.fn() }));
vi.mock("@/server/actions/me", () => ({
  getMySignatureStatus: vi.fn(),
  removeMySignature: vi.fn(),
}));
vi.mock("@/server/actions/why-i-signed", () => ({ saveWhyISigned: vi.fn() }));
vi.mock("@/components/SelfieCapture", () => ({ SelfieCapture: () => null }));

import { buildPostSignShareLinks } from "@/app/SignModal";

const SIGNER_ID = "eeeb0d40-7bee-4bc9-8808-fecb955a8db0";
const ORIGIN = "https://ai-for-people.org";

const links = buildPostSignShareLinks({
  origin: ORIGIN,
  signerId: SIGNER_ID,
  whyISigned: null,
});

describe("buildPostSignShareLinks", () => {
  it("tags the copyable link with ref and the copy channel", () => {
    expect(links.shareUrl).toBe(
      `${ORIGIN}/signatories/${SIGNER_ID}?ref=${SIGNER_ID}&via=copy`,
    );
  });

  it("tags the X link with ref and via=x", () => {
    const url = decodeURIComponent(/&url=([^&\s]+)$/.exec(links.twitterHref)![1]);
    expect(url).toBe(
      `${ORIGIN}/signatories/${SIGNER_ID}?ref=${SIGNER_ID}&via=x`,
    );
  });

  it("tags the LinkedIn link with ref and via=linkedin", () => {
    const url = decodeURIComponent(/\?url=([^&\s]+)$/.exec(links.linkedinHref)![1]);
    expect(url).toBe(
      `${ORIGIN}/signatories/${SIGNER_ID}?ref=${SIGNER_ID}&via=linkedin`,
    );
  });

  it("tags the mailto body with ref and via=email", () => {
    const body = decodeURIComponent(/&body=([^&\s]+)$/.exec(links.emailHref)![1]);
    expect(body).toContain(
      `${ORIGIN}/signatories/${SIGNER_ID}?ref=${SIGNER_ID}&via=email`,
    );
  });

  it("leads the share copy with the signer's own words when they wrote some", () => {
    const withWhy = buildPostSignShareLinks({
      origin: ORIGIN,
      signerId: SIGNER_ID,
      whyISigned: "Because my kids will grow up with this.",
    });
    expect(withWhy.suggestedMessage).toContain(
      "Because my kids will grow up with this.",
    );
  });

  it("renders inert links before the signer id exists", () => {
    const none = buildPostSignShareLinks({
      origin: ORIGIN,
      signerId: null,
      whyISigned: null,
    });
    expect(none.shareUrl).toBe("");
    expect(none.twitterHref).toBe("#");
    expect(none.linkedinHref).toBe("#");
    expect(none.emailHref).toBe("#");
  });

  it("renders inert links during SSR, when there is no window origin", () => {
    const none = buildPostSignShareLinks({
      origin: "",
      signerId: SIGNER_ID,
      whyISigned: null,
    });
    expect(none.shareUrl).toBe("");
    expect(none.twitterHref).toBe("#");
  });
});
