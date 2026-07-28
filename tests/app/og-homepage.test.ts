import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/db/queries", () => ({
  getSignatureCount: vi.fn(),
}));

import { GET } from "@/app/api/og/route";
import { getSignatureCount } from "@/lib/db/queries";

/** PNG magic bytes: \x89 P N G \r \n \x1a \n */
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function expectPng(bytes: Uint8Array) {
  expect(Array.from(bytes.slice(0, 8))).toEqual(PNG_MAGIC);
}

describe("GET /api/og (homepage share card)", () => {
  beforeEach(() => {
    vi.mocked(getSignatureCount).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders a 1200x630 PNG with the live signature count", async () => {
    vi.mocked(getSignatureCount).mockResolvedValue(90);

    const res = await GET();

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("image/png");

    const bytes = new Uint8Array(await res.arrayBuffer());
    expectPng(bytes);
    // The signer card is ~40KB; anything under a few KB means an empty render.
    expect(bytes.byteLength).toBeGreaterThan(5000);
  });

  it("degrades to a static card instead of throwing when the DB is down", async () => {
    vi.mocked(getSignatureCount).mockRejectedValue(new Error("DB unreachable"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await GET();

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("image/png");
    expectPng(new Uint8Array(await res.arrayBuffer()));
    expect(err).toHaveBeenCalled();
  });

  it("renders at counts past 1,000, where the number becomes the social proof", async () => {
    vi.mocked(getSignatureCount).mockResolvedValue(12_345);

    const res = await GET();

    expect(res.status).toBe(200);
    expectPng(new Uint8Array(await res.arrayBuffer()));
  });
});
