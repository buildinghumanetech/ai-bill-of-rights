import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/db/queries", () => ({
  getSignerById: vi.fn(),
  listSignaturesForSigner: vi.fn(),
}));

vi.mock("@/lib/selfie/queries", () => ({
  getActiveSelfieForSigner: vi.fn(),
}));

// `<SelfieAvatar>` is an async server component and `<ReportSelfieButton>`
// pulls in server actions — neither survives a plain SSR render, and neither
// is what these tests are about.
vi.mock("@/components/SelfieAvatar", () => ({
  SelfieAvatar: ({ displayName }: { displayName: string }) => (
    <div data-testid="selfie-avatar">{displayName}</div>
  ),
}));
vi.mock("@/components/ReportSelfieButton", () => ({
  ReportSelfieButton: () => <button type="button">Report this photo</button>,
}));
// `<SignTrigger>` itself is real (it is the CTA under test); its modal is not.
vi.mock("@/app/SignModal", () => ({ default: () => null }));

import { auth } from "@clerk/nextjs/server";
import { getSignerById, listSignaturesForSigner } from "@/lib/db/queries";
import { getActiveSelfieForSigner } from "@/lib/selfie/queries";
import { articles } from "@/app/HomepageArticles";
import { gist } from "@/components/CommitmentsSummary";
import { MAX_WHY_I_SIGNED_LENGTH } from "@/lib/why-i-signed";
import { signerCardQuote } from "@/lib/og/signer-quote";
import SignerProfile from "@/app/signatories/[id]/page";

/** React escapes apostrophes in text nodes; article copy is full of them. */
function asHtml(text: string): string {
  return text.replace(/'/g, "&#x27;");
}

const SIGNER_ID = "11111111-2222-4333-8444-555555555555";
const OWNER_CLERK_ID = "user_owner";

interface SignerOverrides {
  whyISigned?: string | null;
}

function mockSigner(overrides: SignerOverrides = {}) {
  vi.mocked(getSignerById).mockResolvedValue({
    id: SIGNER_ID,
    clerkUserId: OWNER_CLERK_ID,
    displayName: "Ada Lovelace",
    affiliation: "Analytical Engines",
    locationText: "London, UK",
    verificationMethod: "email",
    whyISigned: null,
    ...overrides,
  } as never);
  vi.mocked(listSignaturesForSigner).mockResolvedValue([
    { version: "0.0.1", signedAt: new Date("2026-05-18T12:00:00Z") },
  ] as never);
  vi.mocked(getActiveSelfieForSigner).mockResolvedValue(null as never);
}

function viewerIs(userId: string | null) {
  vi.mocked(auth).mockResolvedValue({ userId } as never);
}

async function renderPage(): Promise<string> {
  const element = await SignerProfile({
    params: Promise.resolve({ id: SIGNER_ID }),
  });
  return renderToStaticMarkup(element);
}

describe("signer page as a landing page for a stranger", () => {
  beforeEach(() => {
    vi.mocked(auth).mockReset();
    vi.mocked(getSignerById).mockReset();
    vi.mocked(listSignaturesForSigner).mockReset();
    vi.mocked(getActiveSelfieForSigner).mockReset();
    process.env.NEXT_PUBLIC_SITE_URL = "https://ai-for-people.org";
  });

  it("does NOT show the share box to an anonymous visitor", async () => {
    mockSigner();
    viewerIs(null);
    const html = await renderPage();
    expect(html).not.toContain("Share your signature");
    expect(html).not.toContain("Share on LinkedIn");
  });

  it("does NOT show the share box to a different signed-in signer", async () => {
    mockSigner();
    viewerIs("user_someone_else");
    const html = await renderPage();
    expect(html).not.toContain("Share your signature");
    // ...nor the owner-only revoke link.
    expect(html).not.toContain("Remove your signature");
  });

  it("shows the share box and revoke link to the owner", async () => {
    mockSigner();
    viewerIs(OWNER_CLERK_ID);
    const html = await renderPage();
    expect(html).toContain("Share your signature");
    expect(html).toContain("Remove your signature");
    // The owner already signed — no "add your name" ask.
    expect(html).not.toContain("Add your name");
  });

  it("builds owner share links with ref/via attribution", async () => {
    mockSigner();
    viewerIs(OWNER_CLERK_ID);
    const html = await renderPage();
    // Copy field carries the copy channel.
    expect(html).toContain(
      `https://ai-for-people.org/signatories/${SIGNER_ID}?ref=${SIGNER_ID}&amp;via=copy`,
    );
    // X and LinkedIn links are URL-encoded inside the intent/share URLs.
    for (const channel of ["x", "linkedin", "email"]) {
      expect(html).toContain(
        encodeURIComponent(
          `https://ai-for-people.org/signatories/${SIGNER_ID}?ref=${SIGNER_ID}&via=${channel}`,
        ).replace(/&/g, "&amp;"),
      );
    }
  });

  it("shows the sign CTA and the nine commitments to a non-owner", async () => {
    mockSigner();
    viewerIs(null);
    const html = await renderPage();
    expect(html).toContain("Sign the AI Bill of Rights");
    expect(html).toContain("Add your name");
    expect(html).toContain("What they signed");
    for (const article of articles) {
      expect(html).toContain(asHtml(article.title));
    }
  });

  // The titles alone do not prove the summary renders anything *under* them:
  // deleting the `<p>{gist(article.body)}</p>` line, or swapping it for the
  // whole `article.body`, leaves every other assertion in this file green.
  // These two pin both halves — the gist reaches the HTML, and it is the
  // condensed form rather than the full paragraph.
  it("renders each commitment's gist, not its whole body, under the title", async () => {
    mockSigner();
    viewerIs(null);
    const html = await renderPage();
    for (const article of articles) {
      expect(html).toContain(asHtml(gist(article.body)));
    }
    // Article 01's second sentence — present in the body, absent from the gist.
    expect(articles[0].body).toContain("Opt-out is not consent.");
    expect(html).not.toContain("Opt-out is not consent.");
  });

  it("puts the sign CTA above the signature record for a non-owner", async () => {
    mockSigner();
    viewerIs(null);
    const html = await renderPage();
    const ctaAt = html.indexOf("Sign the AI Bill of Rights");
    const commitmentsAt = html.indexOf("What they signed");
    const recordAt = html.indexOf("Signature record");
    expect(ctaAt).toBeGreaterThan(-1);
    expect(commitmentsAt).toBeGreaterThan(ctaAt);
    expect(recordAt).toBeGreaterThan(commitmentsAt);
  });

  // The heading of the first CTA section is "Add your name to the AI Bill of
  // Rights", so a bare `toContain("Add your name")` is satisfied without the
  // second CTA existing at all. These assertions pin the button that sits
  // *below* the commitments list — the one there to catch a reader who has
  // just finished the nine articles — so deleting it turns the suite red.
  // Counting `>Add your name</` matches the button's whole text node only:
  // the heading renders as `Add your name to the <a`, so rewording that
  // heading (copy this test has no opinion about) cannot fail this test.
  it("repeats the sign CTA below the commitments list for a non-owner", async () => {
    mockSigner();
    viewerIs(null);
    const html = await renderPage();
    const occurrences = html.split(">Add your name</").length - 1;
    expect(occurrences).toBe(1);
    const commitmentsAt = html.indexOf("What they signed");
    expect(commitmentsAt).toBeGreaterThan(-1);
    // The last occurrence is the standalone button, after the nine articles.
    expect(html.lastIndexOf("Add your name")).toBeGreaterThan(commitmentsAt);
    // ...and after the final article's title, not tucked between them.
    const lastArticleTitle = articles[articles.length - 1].title.replace(
      /'/g,
      "&#x27;",
    );
    expect(html.indexOf(lastArticleTitle)).toBeGreaterThan(-1);
    expect(html.lastIndexOf("Add your name")).toBeGreaterThan(
      html.indexOf(lastArticleTitle),
    );
  });

  it("renders the why-I-signed statement as a pull quote when present", async () => {
    mockSigner({
      whyISigned: "Because my kids will grow up with these systems.",
    });
    viewerIs(null);
    const html = await renderPage();
    expect(html).toContain(
      "Because my kids will grow up with these systems.",
    );
    expect(html).toContain("on why they signed");
    expect(html).toContain("<blockquote");
    // The quote leads — it comes before the ask.
    expect(html.indexOf("Because my kids")).toBeLessThan(
      html.indexOf("Sign the AI Bill of Rights"),
    );
  });

  it("bounds the pull quote's height so the sign CTA stays reachable", async () => {
    // 200 characters is the server-side cap on `whyISigned`; unclamped at this
    // type size that is roughly seven lines on a phone, burying the CTA.
    const longest = "A".repeat(200);
    mockSigner({ whyISigned: longest });
    viewerIs(null);
    const html = await renderPage();
    const quoteAt = html.indexOf("<blockquote");
    expect(quoteAt).toBeGreaterThan(-1);
    const openTag = html.slice(quoteAt, html.indexOf(">", quoteAt));
    expect(openTag).toContain("line-clamp-4");
    // The quote is still rendered in full — the clamp is visual, not a server
    // side truncation, so the text stays available to crawlers and a11y tools.
    expect(html).toContain(longest);
    // ...and nothing inside the clamp can be left dangling by it. A closing
    // curly quote is the first character `line-clamp` eats, so an opening one
    // inside the clamped element renders as `“…` with no partner on exactly
    // the phone widths the clamp was added for. Balanced counts hold whether
    // the marks are dropped (they are, today) or moved outside the clamp.
    const quote = html.slice(quoteAt, html.indexOf("</blockquote>", quoteAt));
    const opens = (quote.match(/“|&ldquo;/g) ?? []).length;
    const closes = (quote.match(/”|&rdquo;/g) ?? []).length;
    expect(opens).toBe(closes);
  });

  it("renders cleanly when why-I-signed is null", async () => {
    mockSigner({ whyISigned: null });
    viewerIs(null);
    const html = await renderPage();
    expect(html).not.toContain("on why they signed");
    expect(html).not.toContain("<blockquote");
    expect(html).toContain("Ada Lovelace");
    expect(html).toContain("Sign the AI Bill of Rights");
  });

  it("treats a whitespace-only why-I-signed as absent", async () => {
    mockSigner({ whyISigned: "   " });
    viewerIs(null);
    const html = await renderPage();
    expect(html).not.toContain("<blockquote");
  });

  // This page is the most prominent display of the statement, and it used to
  // derive the quote with a bare `.trim()` — no cap, no whitespace collapse, no
  // control-character strip. A legacy row therefore rendered here in full while
  // the OG card for the same signer showed 200 characters, so the two surfaces
  // disagreed about what the person said. Both tests below pin the fix: this
  // page runs the same `normalizeWhyISigned` as the writer and the OG card.
  it("re-clamps an over-long legacy row rather than rendering it whole", async () => {
    const raw = "x".repeat(1000);
    mockSigner({ whyISigned: raw });
    viewerIs(null);
    const html = await renderPage();
    expect(html).toContain("<blockquote");
    expect(html).toContain("x".repeat(MAX_WHY_I_SIGNED_LENGTH));
    expect(html).not.toContain("x".repeat(MAX_WHY_I_SIGNED_LENGTH + 1));
    // ...and what it renders is exactly what the OG card renders, which is the
    // agreement between the two surfaces that the sanitiser exists to buy.
    expect(html).toContain(signerCardQuote(raw).text as string);
  });

  it("collapses whitespace and strips control characters in the pull quote", async () => {
    // \u0007 is a C0 control character that `\s` does not match, so only the
    // control-character pass inside `normalizeWhyISigned` can remove it.
    mockSigner({ whyISigned: "I\u0007signed  for\n\nmy   students." });
    viewerIs(null);
    const html = await renderPage();
    expect(html).toContain("I signed for my students.");
    expect(html).not.toContain("\u0007");
    expect(html).not.toContain("my   students");
  });

  it("does not put a bare signature count in front of a newcomer", async () => {
    mockSigner();
    viewerIs(null);
    const html = await renderPage();
    expect(html).not.toMatch(/\d+\s+signatures/i);
    expect(html).not.toMatch(/\d+\s+people have signed/i);
  });
});
