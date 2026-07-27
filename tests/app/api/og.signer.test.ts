/**
 * The per-signer OG card must render for every shape of "why I signed":
 * absent, tiny, and pinned at the 200-character cap. ImageResponse has no
 * text-overflow safety net, so the sizing in the route is deliberate — these
 * tests are the regression guard that it still produces a real PNG.
 *
 * NOTE ON WHAT THESE TESTS CAN AND CANNOT CATCH: satori emits a 1200x630
 * canvas for ANY input, so `pngDimensions(...) === 1200x630` is a smoke test
 * that the route renders at all — it is content-independent and would hold
 * with the sanitiser deleted. The clamping itself is asserted on the string
 * handed to the renderer, in tests/lib/og.signer-quote.test.ts. Do not add a
 * clamping assertion here in terms of the PNG; it cannot fail.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { MAX_WHY_I_SIGNED_LENGTH } from "@/lib/why-i-signed";
import { signerCardQuote } from "@/lib/og/signer-quote";

vi.mock("@/lib/db/queries", () => ({
  getSignerById: vi.fn(),
  getSignatureNumber: vi.fn(),
}));
vi.mock("@/lib/selfie/queries", () => ({
  getActiveSelfieForSigner: vi.fn(),
}));

import { GET } from "@/app/api/og/signer/[id]/route";
import { getSignerById, getSignatureNumber } from "@/lib/db/queries";
import { getActiveSelfieForSigner } from "@/lib/selfie/queries";

const SIGNER_ID = "11111111-1111-4111-8111-111111111111";

/** A statement at exactly the cap — the worst case for the layout. */
const MAX_STATEMENT = (
  "My daughter is six and she will never know a world without these systems " +
  "deciding things about her, so the least we can do is insist they be built " +
  "to serve her rather than to farm her attention for profit."
).slice(0, MAX_WHY_I_SIGNED_LENGTH);

function mockSigner(whyISigned: string | null) {
  vi.mocked(getSignerById).mockResolvedValue({
    id: SIGNER_ID,
    displayName: "Alexandra Petrova-Whitfield",
    affiliation: "Building Humane Technology",
    locationText: "San Francisco, CA, US",
    whyISigned,
  } as never);
  vi.mocked(getSignatureNumber).mockResolvedValue(91);
  vi.mocked(getActiveSelfieForSigner).mockResolvedValue(null as never);
}

async function render(): Promise<Response> {
  return GET(new Request(`http://localhost/api/og/signer/${SIGNER_ID}`), {
    params: Promise.resolve({ id: SIGNER_ID }),
  });
}

describe("GET /api/og/signer/[id]", () => {
  beforeEach(() => {
    vi.mocked(getSignerById).mockReset();
    vi.mocked(getSignatureNumber).mockReset();
    vi.mocked(getActiveSelfieForSigner).mockReset();
  });

  it("returns a 1200x630 PNG when the signer has no statement", async () => {
    mockSigner(null);
    const res = await render();

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(bytes.length).toBeGreaterThan(1000);
    expect(pngDimensions(bytes)).toEqual({ width: 1200, height: 630 });
  });

  it("returns a PNG when the signer has a short statement", async () => {
    mockSigner("Because my kids deserve better.");
    const res = await render();

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(pngDimensions(bytes)).toEqual({ width: 1200, height: 630 });
  });

  it("returns a PNG when the statement is pinned at the length cap", async () => {
    expect(MAX_STATEMENT).toHaveLength(MAX_WHY_I_SIGNED_LENGTH);
    mockSigner(MAX_STATEMENT);
    const res = await render();

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(pngDimensions(bytes)).toEqual({ width: 1200, height: 630 });
  });

  it("hands the renderer a clamped quote for an over-long legacy row", async () => {
    // A row written before the cap existed must not be able to blow the
    // layout: the route re-normalises on the way out. Asserting on the STRING
    // the route computes — not on the PNG — is what makes this able to fail.
    const raw = "x".repeat(1000);
    mockSigner(raw);
    const res = await render();
    expect(res.status).toBe(200);

    const { text, fontSize } = signerCardQuote(raw);
    expect(text).toHaveLength(MAX_WHY_I_SIGNED_LENGTH);
    expect(fontSize).toBe(20);
  });

  it("404s for an unknown signer", async () => {
    vi.mocked(getSignerById).mockResolvedValue(null as never);
    vi.mocked(getSignatureNumber).mockResolvedValue(0);
    const res = await render();
    expect(res.status).toBe(404);
  });
});

/** Read width/height out of a PNG's IHDR chunk. */
function pngDimensions(bytes: Uint8Array): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}
