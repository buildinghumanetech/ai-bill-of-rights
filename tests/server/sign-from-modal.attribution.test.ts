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
 *
 * And they pin the split between the two reported fields. `referred` is read
 * back off what `upsertSignerProfile` persisted, never off the cookie, so it
 * can be reconciled against `countReferralsBySigner`; `channel` stays on the
 * cookie, because the arrival surface is real regardless of whether the ref
 * survived. `referred:false, channel:"linkedin"` is a valid event.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

const SIGNER_ID = "eeeb0d40-7bee-4bc9-8808-fecb955a8db0";
const REFERRER_ID = "c06cbb39-bcb6-4b3c-bd22-e0154a4c7322";
/** A perfectly well-formed ref whose signer row is gone. */
const DELETED_REFERRER_ID = "3f1c2b7a-5d64-4a91-9c33-7b0e2a8d4f16";

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

/**
 * Signer ids that still have a row. The real `upsertSignerProfile` runs the
 * cookie's ref through `resolveReferrerId`, which DROPS it when the referrer's
 * row is gone, and returns what it actually persisted. The mock reproduces
 * both branches, because the point of these tests is what the action reports
 * when the cookie and the database disagree.
 */
const liveReferrers = new Set<string>([REFERRER_ID]);
/** Non-null to simulate the UPDATE branch: attribution already on the row. */
let attributionAlreadyOnRow: string | null = null;

const upsertSignerProfile = vi.fn(
  async (_db: unknown, input: { referredBySignerId?: string | null }) => {
    if (attributionAlreadyOnRow !== null) {
      return { id: SIGNER_ID, referredBySignerId: attributionAlreadyOnRow };
    }
    const ref = input?.referredBySignerId ?? null;
    return {
      id: SIGNER_ID,
      referredBySignerId: ref !== null && liveReferrers.has(ref) ? ref : null,
    };
  },
);
/**
 * The action now resolves the production client itself and passes it in — the
 * data-layer writes take `db` as a required argument rather than falling back
 * to production on `null`. Stub the resolver so these tests never touch a
 * real client, and assert the action forwards it.
 */
const { FAKE_DB } = vi.hoisted(() => ({ FAKE_DB: { __fakeDb: true } }));
vi.mock("@/lib/db/lazy", () => ({ getDb: () => FAKE_DB }));

vi.mock("@/server/profile/upsert", () => ({
  upsertSignerProfile: (...args: unknown[]) =>
    (upsertSignerProfile as unknown as (...a: unknown[]) => unknown)(...args),
}));

vi.mock("@/server/signatures/record", () => ({
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
  liveReferrers.clear();
  liveReferrers.add(REFERRER_ID);
  attributionAlreadyOnRow = null;
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
      FAKE_DB,
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

  it("reports referred:false when the ref named a signer who has since deleted their account", async () => {
    // The bug this test exists for. The cookie looks perfect, so the old code
    // reported `referred:true` — but `upsertSignerProfile` dropped the ref
    // rather than trip the foreign key, and `signers.referred_by_signer_id`
    // is null. Reporting true here mints a referral conversion that
    // `countReferralsBySigner` can never account for, and because both
    // numbers look plausible nobody ever notices the gap.
    cookieStore.set(REF_COOKIE, DELETED_REFERRER_ID);
    cookieStore.set(REF_CHANNEL_COOKIE, "linkedin");

    const res = await recordSignatureFromModal(INPUT);

    expect(res.success).toBe(true);
    expect(res.referred).toBe(false);
    // The ref still went to the write — dropping it is the writer's job, not
    // the caller's — it just didn't survive.
    expect(upsertSignerProfile).toHaveBeenCalledWith(
      FAKE_DB,
      expect.objectContaining({ referredBySignerId: DELETED_REFERRER_ID }),
    );
  });

  it("keeps reporting the channel even when the ref did not survive", async () => {
    // `channel` is deliberately independent of `referred`: it answers "which
    // surface did this visitor arrive from", which is still true and still
    // worth knowing when the referrer's row is gone.
    cookieStore.set(REF_COOKIE, DELETED_REFERRER_ID);
    cookieStore.set(REF_CHANNEL_COOKIE, "linkedin");

    const res = await recordSignatureFromModal(INPUT);

    expect(res.referred).toBe(false);
    expect(res.channel).toBe("linkedin");
  });

  it("reports referred:true off the stored attribution even with no ref cookie", async () => {
    // A returning signer editing their profile: attribution was written on
    // their first visit and the update branch reports it back. The cookie is
    // long gone, but the database row still says they were referred.
    attributionAlreadyOnRow = REFERRER_ID;

    const res = await recordSignatureFromModal(INPUT);

    expect(res.success).toBe(true);
    expect(res.referred).toBe(true);
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
      FAKE_DB,
      expect.objectContaining({ referredBySignerId: null }),
    );
  });
});
