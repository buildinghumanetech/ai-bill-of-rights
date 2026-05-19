import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db/queries", () => ({
  getSignatureCount: vi.fn(),
  listRecentSignersSince: vi.fn(),
}));

import { GET } from "@/app/api/signers/recent/route";
import { getSignatureCount, listRecentSignersSince } from "@/lib/db/queries";

describe("GET /api/signers/recent", () => {
  beforeEach(() => {
    vi.mocked(getSignatureCount).mockReset();
    vi.mocked(listRecentSignersSince).mockReset();
  });

  it("returns { count, newSigners } shape with no since param (cold-start)", async () => {
    vi.mocked(getSignatureCount).mockResolvedValue(7);
    vi.mocked(listRecentSignersSince).mockResolvedValue([
      {
        id: "abc",
        displayName: "Alice",
        locationText: "NYC, US",
        signedAt: new Date("2026-05-19T20:00:00Z"),
      },
    ]);

    const req = new NextRequest("http://localhost/api/signers/recent");
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = await res.json();
    expect(body.count).toBe(7);
    expect(body.newSigners).toHaveLength(1);
    expect(body.newSigners[0]).toEqual({
      id: "abc",
      displayName: "Alice",
      locationText: "NYC, US",
      signedAt: "2026-05-19T20:00:00.000Z",
    });
    expect(vi.mocked(listRecentSignersSince).mock.calls[0][0]).toBeNull();
  });

  it("passes the since cursor through to listRecentSignersSince", async () => {
    vi.mocked(getSignatureCount).mockResolvedValue(7);
    vi.mocked(listRecentSignersSince).mockResolvedValue([]);

    const since = "2026-05-19T20:30:00.000Z";
    const req = new NextRequest(
      `http://localhost/api/signers/recent?since=${encodeURIComponent(since)}`,
    );
    await GET(req);

    const arg = vi.mocked(listRecentSignersSince).mock.calls[0][0];
    expect(arg).toBeInstanceOf(Date);
    expect(arg!.toISOString()).toBe(since);
  });

  it("returns 400 when since is not a valid ISO timestamp", async () => {
    const req = new NextRequest(
      "http://localhost/api/signers/recent?since=not-a-date",
    );
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns 500 on DB error without leaking internals", async () => {
    vi.mocked(getSignatureCount).mockRejectedValue(
      new Error("DATABASE_URL not set; credentials redacted=abc123"),
    );
    vi.mocked(listRecentSignersSince).mockResolvedValue([]);

    const req = new NextRequest("http://localhost/api/signers/recent");
    const res = await GET(req);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBeTruthy();
    expect(JSON.stringify(body)).not.toContain("DATABASE_URL");
    expect(JSON.stringify(body)).not.toContain("abc123");
  });
});
