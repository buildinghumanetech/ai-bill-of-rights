/**
 * The wiring between "someone signed" and "the confirmation email carries
 * their referral tag".
 *
 * `signConfirmation` grew a `signerId` param so its share links could carry
 * `?ref=`, but a template param nobody passes is worth exactly nothing — the
 * email goes to 100% of signers, so an untagged one is the single largest
 * attribution leak on the site. These tests drive the real server action with
 * everything around it mocked and assert on the email that actually goes out.
 *
 * They also pin the other half of the loop: the `via` channel cookie the proxy
 * stamped on arrival is read back at signing time, and a broken cookie jar
 * degrades to "unattributed" instead of costing us the signature.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

const SIGNER_ID = "eeeb0d40-7bee-4bc9-8808-fecb955a8db0";
const REFERRER_ID = "c06cbb39-bcb6-4b3c-bd22-e0154a4c7322";

const cookieStore = new Map<string, string>();
let cookiesThrows = false;

vi.mock("next/headers", () => ({
  cookies: async () => {
    if (cookiesThrows) throw new Error("cookie jar unavailable");
    return {
      get: (name: string) => {
        const value = cookieStore.get(name);
        return value === undefined ? undefined : { name, value };
      },
    };
  },
  headers: async () => new Headers(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: "user_test" }),
  clerkClient: async () => ({
    users: {
      getUser: async () => ({
        primaryEmailAddress: { emailAddress: "ada@example.com" },
      }),
    },
  }),
}));

const upsertSignerProfile = vi.fn(async () => ({ id: SIGNER_ID }));
vi.mock("@/server/actions/profile", () => ({
  upsertSignerProfile: (...args: unknown[]) =>
    (upsertSignerProfile as unknown as (...a: unknown[]) => unknown)(...args),
}));

vi.mock("@/server/actions/sign", () => ({
  recordSignature: async () => ({ signatureId: "sig_1" }),
}));

vi.mock("@/lib/db/queries", () => ({
  getSignatureCount: async () => 137,
  getSignatureNumber: async () => 42,
}));

const sentEmails: Array<{ to: string; subject: string; text: string; html?: string }> =
  [];
vi.mock("@/lib/email/send", () => ({
  sendEmail: async (msg: {
    to: string;
    subject: string;
    text: string;
    html?: string;
  }) => {
    sentEmails.push(msg);
    return { id: "email_1" };
  },
}));

import { recordSignatureFromModal } from "@/server/actions/sign-from-modal";
import { REF_COOKIE, REF_CHANNEL_COOKIE } from "@/lib/referral/cookie";

const INPUT = {
  firstName: "Ada",
  lastName: "Lovelace",
  method: "email" as const,
  shareLocation: false,
  versionString: "0.0.1",
};

/** The signer-confirmation email, as opposed to the team notification. */
function confirmationEmail() {
  return sentEmails.find((m) => m.to === "ada@example.com");
}

beforeEach(() => {
  sentEmails.length = 0;
  cookieStore.clear();
  cookiesThrows = false;
  upsertSignerProfile.mockClear();
});

describe("recordSignatureFromModal — confirmation email attribution", () => {
  it("tags every share link in the confirmation email with the signer's own ref", async () => {
    const res = await recordSignatureFromModal(INPUT);
    expect(res.success).toBe(true);

    const mail = confirmationEmail();
    expect(mail).toBeDefined();
    // Percent-encoded inside the X/LinkedIn hrefs, literal in the pasteable
    // suggested message — both must credit this signer.
    expect(mail!.text).toContain(`ref%3D${SIGNER_ID}`);
    expect(mail!.text).toContain(`ref=${SIGNER_ID}`);
    expect(mail!.html).toContain(`ref=${SIGNER_ID}`);
  });
});

describe("recordSignatureFromModal — reading the attribution cookies", () => {
  it("reports the ref and via it was signed under", async () => {
    cookieStore.set(REF_COOKIE, REFERRER_ID);
    cookieStore.set(REF_CHANNEL_COOKIE, "linkedin");

    const res = await recordSignatureFromModal(INPUT);

    expect(res.success).toBe(true);
    expect(res.referred).toBe(true);
    expect(res.channel).toBe("linkedin");
    // …and the ref still reaches the database write, as it always did.
    expect(upsertSignerProfile).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ referredBySignerId: REFERRER_ID }),
    );
  });

  it("reports an un-refed channel on its own", async () => {
    cookieStore.set(REF_CHANNEL_COOKIE, "x");

    const res = await recordSignatureFromModal(INPUT);

    expect(res.referred).toBe(false);
    expect(res.channel).toBe("x");
  });

  it("drops a junk channel cookie rather than reporting it", async () => {
    cookieStore.set(REF_CHANNEL_COOKIE, "myspace");

    const res = await recordSignatureFromModal(INPUT);

    expect(res.success).toBe(true);
    expect(res.channel).toBeNull();
  });

  it("still records the signature when the cookie jar throws", async () => {
    // ATTRIBUTION MUST NEVER COST US A SIGNATURE.
    cookiesThrows = true;

    const res = await recordSignatureFromModal(INPUT);

    expect(res.success).toBe(true);
    expect(res.signerId).toBe(SIGNER_ID);
    expect(res.channel).toBeNull();
    expect(res.referred).toBe(false);
    expect(upsertSignerProfile).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ referredBySignerId: null }),
    );
  });
});
