/**
 * What the account page hands the "why you signed" editor.
 *
 * The rule the rest of the app follows is that every surface re-derives the
 * statement through `normalizeWhyISigned` rather than trusting the column — the
 * signer page and the OG card both do. The editor was the hole: a row written
 * before the cap existed arrived raw, filling a textarea whose `maxLength` only
 * bounds typing (it does not truncate a value set programmatically) and whose
 * counter would then read "1000/200" in amber, against a statement every public
 * surface displays clamped to 200.
 *
 * `AccountClient` is stubbed here so the prop is visible in the markup; the
 * editor's own behaviour is pinned in account-client.why-update-disabled.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MAX_WHY_I_SIGNED_LENGTH } from "@/lib/why-i-signed";

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { select: vi.fn() } }));
vi.mock("@/lib/db/queries", () => ({ listSignaturesForSigner: vi.fn() }));
vi.mock("@/lib/selfie/queries", () => ({ getLatestSelfieForSigner: vi.fn() }));

// The editor is a "use client" component that imports two "use server" modules;
// none of that survives an SSR render, and none of it is what this file is
// about. The stub writes the prop under test where an assertion can read it.
vi.mock("@/app/account/AccountClient", () => ({
  default: ({ initialWhyISigned }: { initialWhyISigned: string | null }) => (
    <div data-initial-why-i-signed={initialWhyISigned ?? "(null)"} />
  ),
}));

import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { listSignaturesForSigner } from "@/lib/db/queries";
import { getLatestSelfieForSigner } from "@/lib/selfie/queries";
import AccountPage from "@/app/account/page";

const CLERK_ID = "user_account";

/**
 * `page.tsx` reads its signer with `db.select().from().where().limit(1)`; this
 * is the smallest stand-in that answers that exact chain.
 */
function mockSignerRow(whyISigned: string | null) {
  vi.mocked(auth).mockResolvedValue({ userId: CLERK_ID } as never);
  vi.mocked(db.select).mockReturnValue({
    from: () => ({
      where: () => ({
        limit: async () => [
          {
            id: "11111111-1111-4111-8111-111111111111",
            clerkUserId: CLERK_ID,
            displayName: "Alexandra Petrova-Whitfield",
            affiliation: null,
            locationText: null,
            verificationMethod: "email",
            isAdmin: false,
            whyISigned,
          },
        ],
      }),
    }),
  } as never);
  vi.mocked(listSignaturesForSigner).mockResolvedValue([] as never);
  vi.mocked(getLatestSelfieForSigner).mockResolvedValue(null as never);
}

/** Render the page and pull the prop back out of the stub's markup. */
async function initialWhyISigned(stored: string | null): Promise<string> {
  mockSignerRow(stored);
  const html = renderToStaticMarkup(
    await AccountPage({ searchParams: Promise.resolve({}) }),
  );
  const m = html.match(/data-initial-why-i-signed="([^"]*)"/);
  if (!m) throw new Error("AccountClient stub did not render");
  return m[1];
}

describe("account page → AccountClient: initialWhyISigned", () => {
  beforeEach(() => {
    vi.mocked(auth).mockReset();
    vi.mocked(db.select).mockReset();
  });

  it("clamps a legacy over-long row down to the cap", async () => {
    expect(await initialWhyISigned("x".repeat(1000))).toHaveLength(
      MAX_WHY_I_SIGNED_LENGTH,
    );
  });

  it("applies the same sanitising the write path does", async () => {
    expect(await initialWhyISigned("  multiple\n\nlines   and\tspaces  ")).toBe(
      "multiple lines and spaces",
    );
  });

  it("passes a statement already within the cap through untouched", async () => {
    expect(await initialWhyISigned("Because my kids deserve better.")).toBe(
      "Because my kids deserve better.",
    );
  });

  it("treats a whitespace-only row as no statement at all", async () => {
    // Not "" — the editor branches on null/empty for whether to offer Remove.
    expect(await initialWhyISigned("   \n  ")).toBe("(null)");
  });
});
