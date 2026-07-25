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
import SignerProfile from "@/app/signatories/[id]/page";

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
      expect(html).toContain(article.title.replace(/'/g, "&#x27;"));
    }
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

  it("does not put a bare signature count in front of a newcomer", async () => {
    mockSigner();
    viewerIs(null);
    const html = await renderPage();
    expect(html).not.toMatch(/\d+\s+signatures/i);
    expect(html).not.toMatch(/\d+\s+people have signed/i);
  });
});
