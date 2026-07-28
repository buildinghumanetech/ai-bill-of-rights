/**
 * The per-signer OG card must render for every shape of "why I signed":
 * absent, tiny, and pinned at the 200-character cap. ImageResponse has no
 * text-overflow safety net, so the sizing in the route is deliberate — these
 * tests are the regression guard that it still produces a real PNG.
 *
 * NOTE ON WHAT THESE TESTS CAN AND CANNOT CATCH: satori emits a 1200x630
 * canvas for ANY input, so `pngDimensions(...) === 1200x630` is a smoke test
 * that the route renders at all — it is content-independent and would hold
 * with the sanitiser deleted. Do not write a clamping assertion in terms of
 * the PNG's dimensions; it cannot fail. The clamp's own rules are asserted in
 * tests/lib/og.signer-quote.test.ts.
 *
 * What is left for THIS file is the wiring — that the route asks
 * `signerCardQuote` about the raw column value and draws what it gets back —
 * and the only way to see that from out here is to watch the route's call. So
 * the module is mocked with a spy wrapping the real implementation. Anything
 * asserted purely on a helper this file called itself is a statement about the
 * helper, not about the route, and will pass with the route bypassing it.
 */

import { createHash } from "node:crypto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MAX_WHY_I_SIGNED_LENGTH } from "@/lib/why-i-signed";
import type { SignerCardQuote } from "@/lib/og/signer-quote";

vi.mock("@/lib/db/queries", () => ({
  getSignerById: vi.fn(),
  getSignatureNumber: vi.fn(),
}));
vi.mock("@/lib/selfie/queries", () => ({
  getActiveSelfieForSigner: vi.fn(),
}));
// A spy AROUND the real implementation, not a stand-in for it: every other
// test in this file still exercises the genuine clamp and sizing, and the
// sanitiser case below can watch the route's use of it. See the note in that
// test for why watching is the only way to make that case able to fail.
vi.mock("@/lib/og/signer-quote", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/og/signer-quote")>();
  return { ...actual, signerCardQuote: vi.fn(actual.signerCardQuote) };
});

import { GET } from "@/app/api/og/signer/[id]/route";
import { getSignerById, getSignatureNumber } from "@/lib/db/queries";
import { getActiveSelfieForSigner } from "@/lib/selfie/queries";
import { signerCardQuote } from "@/lib/og/signer-quote";

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

/**
 * Render once with `signerCardQuote` forced to return `quote`, and reduce the
 * PNG to a digest — comparing digests rather than 100KB byte arrays keeps a
 * failure readable while still being a comparison of every pixel.
 *
 * The forced answer is a single `mockReturnValueOnce`, so the render has to
 * consume exactly one: a route that called the helper twice would take the
 * queued value for the first call and the REAL clamp of the 1000-x row for the
 * second, and a route that stopped calling it would leave the value queued for
 * the next render. Either way the digests would then differ for reasons that
 * have nothing to do with what the card drew, and the caller's assertion would
 * fail pointing at the renderer. Clearing before and counting after turns that
 * into a failure on the call count, where the actual fault is.
 */
async function renderWithQuote(quote: SignerCardQuote): Promise<string> {
  vi.mocked(signerCardQuote).mockClear();
  vi.mocked(signerCardQuote).mockReturnValueOnce(quote);
  const bytes = new Uint8Array(await (await render()).arrayBuffer());
  expect(signerCardQuote).toHaveBeenCalledTimes(1);
  return createHash("sha256").update(bytes).digest("hex");
}

describe("GET /api/og/signer/[id]", () => {
  beforeEach(() => {
    vi.mocked(getSignerById).mockReset();
    vi.mocked(getSignatureNumber).mockReset();
    vi.mocked(getActiveSelfieForSigner).mockReset();
    // mockClear, not mockReset: the spy wraps the real signerCardQuote and
    // resetting it would throw that implementation away.
    vi.mocked(signerCardQuote).mockClear();
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

  it("renders what signerCardQuote returned for the raw column value", async () => {
    // A row written before the cap existed must not be able to blow the
    // layout, and the route's defence is that it renders `signerCardQuote(...)`
    // rather than the column. The PNG's DIMENSIONS cannot show that — satori
    // emits 1200x630 either way — and calling the helper here in the test
    // process and asserting on its return value shows nothing about the route
    // at all: that version of this test passed with the route interpolating
    // `signer.whyISigned` straight into the JSX. So this watches the route's
    // own call, and then watches the pixels move when the answer changes.
    const raw = "x".repeat(1000);
    mockSigner(raw);

    // (a) the route asked the helper about the RAW column value, and the real
    //     implementation clamped it.
    const res = await render();
    expect(res.status).toBe(200);
    expect(signerCardQuote).toHaveBeenCalledTimes(1);
    expect(signerCardQuote).toHaveBeenCalledWith(raw);
    const returned = vi.mocked(signerCardQuote).mock.results[0].value;
    expect(returned.text).toHaveLength(MAX_WHY_I_SIGNED_LENGTH);
    expect(returned.fontSize).toBe(20);

    // (b) ...and the card draws the TEXT that came back. Two renders differing
    //     ONLY in the helper's `text` — same signer row, same font size, same
    //     line height — must produce different pixels. A route that calls the
    //     helper and then draws `signer.whyISigned` anyway produces identical
    //     bytes here, which is what makes this assertion able to fail; the
    //     repeat render pins that byte-identity is a real signal and not just
    //     a non-deterministic renderer never repeating itself.
    const style = { fontSize: 20, lineHeight: 1.38 };
    const drewA = await renderWithQuote({ text: "AAAAAAAAAA", ...style });
    const drewAagain = await renderWithQuote({ text: "AAAAAAAAAA", ...style });
    const drewB = await renderWithQuote({ text: "BBBBBBBBBB", ...style });
    expect(drewAagain).toBe(drewA);
    expect(drewB).not.toBe(drewA);
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
