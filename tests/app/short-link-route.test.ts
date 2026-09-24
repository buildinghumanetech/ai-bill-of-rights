/**
 * /s/[slug] — the short link has to land exactly where the long link would,
 * with ?ref= on the far side so proxy.ts sets the attribution cookie.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const SIGNER_ID = "eeeb0d40-7bee-4bc9-8808-fecb955a8db0";

const resolveShareSlug = vi.fn();
vi.mock("@/lib/db/lazy", () => ({ getDb: () => ({}) }));
vi.mock("@/lib/share/short-links", () => ({
  resolveShareSlug: (...a: unknown[]) => resolveShareSlug(...a),
}));

import { GET } from "@/app/s/[slug]/route";

async function follow(path: string) {
  const req = new NextRequest(new URL(path, "https://ai-for-people.org"));
  const slug = new URL(req.url).pathname.split("/")[2];
  const res = await GET(req, { params: Promise.resolve({ slug }) } as never);
  return { status: res.status, location: new URL(res.headers.get("location")!) };
}

beforeEach(() => {
  resolveShareSlug.mockReset();
});

describe("/s/[slug]", () => {
  it("redirects to the signer's page with their ref and the channel", async () => {
    resolveShareSlug.mockResolvedValue(SIGNER_ID);
    const { status, location } = await follow("/s/k7m2p9q?via=linkedin");
    expect(status).toBe(307);
    expect(location.pathname).toBe(`/signatories/${SIGNER_ID}`);
    expect(location.searchParams.get("ref")).toBe(SIGNER_ID);
    expect(location.searchParams.get("via")).toBe("linkedin");
  });

  it("keeps ref when the link carries no channel", async () => {
    resolveShareSlug.mockResolvedValue(SIGNER_ID);
    const { location } = await follow("/s/k7m2p9q");
    expect(location.searchParams.get("ref")).toBe(SIGNER_ID);
    expect(location.searchParams.has("via")).toBe(false);
  });

  it("drops an unknown channel rather than passing junk through", async () => {
    resolveShareSlug.mockResolvedValue(SIGNER_ID);
    const { location } = await follow("/s/k7m2p9q?via=<script>");
    expect(location.searchParams.has("via")).toBe(false);
  });

  it("sends an unknown slug (or a missing table) to the homepage, not a 404", async () => {
    resolveShareSlug.mockResolvedValue(null);
    const { status, location } = await follow("/s/zzzzzzz?via=x");
    expect(status).toBe(307);
    expect(location.pathname).toBe("/");
    expect(location.searchParams.has("ref")).toBe(false);
    expect(location.searchParams.get("via")).toBe("x");
  });
});
