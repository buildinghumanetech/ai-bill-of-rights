/**
 * POST /api/unsubscribe/<token>: the mail client's one-click button, the
 * unsubscribe page's own POST, and its no-JavaScript form.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({ valid: new Set<string>(), unsubscribed: [] as string[] }));

vi.mock("@/lib/db/lazy", () => ({ getDb: () => ({}) }));
vi.mock("@/server/email/campaign", () => ({
  unsubscribeByToken: async (_db: unknown, token: string) => {
    if (!state.valid.has(token)) return false;
    state.unsubscribed.push(token);
    return true;
  },
}));

import { POST } from "@/app/api/unsubscribe/[token]/route";

const TOKEN = "tok_abcdefghijklmnopqrstuv";

function post(token: string, init: { body?: string; contentType?: string } = {}) {
  return POST(
    new NextRequest(`https://theaibill.org/api/unsubscribe/${token}`, {
      method: "POST",
      body: init.body,
      headers: init.contentType ? { "content-type": init.contentType } : {},
    }),
    { params: Promise.resolve({ token }) },
  );
}

beforeEach(() => {
  state.valid = new Set([TOKEN]);
  state.unsubscribed = [];
});

describe("POST /api/unsubscribe/<token>", () => {
  it("answers a mail client's one-click POST with 200", async () => {
    const res = await post(TOKEN, {
      body: "List-Unsubscribe=One-Click",
      contentType: "application/x-www-form-urlencoded",
    });
    expect(res.status).toBe(200);
    expect(state.unsubscribed).toEqual([TOKEN]);
  });

  it("answers the page's own POST with 200", async () => {
    const res = await post(TOKEN);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("sends the no-JavaScript form back to the confirmation page", async () => {
    const res = await post(TOKEN, { body: "", contentType: "application/x-www-form-urlencoded" });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`https://theaibill.org/unsubscribe/${TOKEN}?done=1`);
  });

  it("404s an unknown token and changes nothing", async () => {
    const res = await post("unknown_token_unknown_token");
    expect(res.status).toBe(404);
    expect(state.unsubscribed).toEqual([]);
  });
});
