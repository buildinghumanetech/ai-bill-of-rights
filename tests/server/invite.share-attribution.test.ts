/**
 * The invitation email is the highest-INTENT share surface on the site: a
 * named friend, personally addressed, by someone who just signed.
 *
 * It was also the only share surface carrying no attribution at all. The
 * action hand-built `${siteUrl}/signatories/${id}` instead of going through
 * `signerShareUrl`, and passed the bare `siteUrl` for the "read it" link, so a
 * friend who clicked through and signed was attributed to NOBODY and landed in
 * no channel bucket. Meanwhile the modal already reports
 * `share_clicked{channel:"invite"}` when a send succeeds — so the funnel could
 * record the click and never the conversion, and `invite` would read as "high
 * share volume, zero conversions" purely as an artifact of untagged links.
 *
 * These tests drive the real server action with Clerk, the database and the
 * mailer mocked, and assert on the email that actually goes out. Reverting the
 * two links in `invite.ts` to hand-built URLs turns them red — which is the
 * point; a check against `signerShareUrl`'s own output would be a tautology.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import Module from "node:module";
import {
  REF_PARAM,
  CHANNEL_PARAM,
  isShareChannel,
} from "@/lib/share/urls";

const SITE_URL = "https://ai-for-people.org";
const INVITER_ID = "eeeb0d40-7bee-4bc9-8808-fecb955a8db0";

const state = vi.hoisted(() => ({
  clerkUserId: null as string | null,
  signerRows: [] as unknown[],
}));

/**
 * A stand-in for the drizzle chain `invite.ts` runs:
 * `db.select().from(signers).where(eq(...)).limit(1)`. Nothing about the query
 * itself is under test here — only what the action does with the row it gets.
 */
const dbStub = {
  select: () => ({
    from: () => ({
      where: () => ({
        limit: async () => state.signerRows,
      }),
    }),
  }),
};

/**
 * `invite.ts` reaches for the Neon client through a lazy CommonJS
 * `require("@/lib/db")`, deliberately, so the client is not constructed at
 * import time. CJS resolution knows nothing about Vite's `@` alias or
 * Vitest's module registry, so `vi.mock` alone does not intercept it —
 * patching `Module._load` is the hook that sits underneath `require`.
 *
 * Installed in beforeAll rather than at import time so the patch's lifetime is
 * a symmetric hook pair: installed at import time it would outlive this file
 * whenever collection throws, and every later suite in the same worker would
 * get this file's stub back from `require("@/lib/db")`.
 */
const loader = Module as unknown as {
  _load(request: string, parent: unknown, isMain: boolean): unknown;
};
const originalLoad = loader._load;
beforeAll(() => {
  loader._load = function (this: unknown, request, ...rest) {
    if (request === "@/lib/db") return { db: dbStub };
    return originalLoad.call(this, request, ...rest);
  } as typeof originalLoad;
});
afterAll(() => {
  loader._load = originalLoad;
});

vi.mock("@/lib/db", () => ({ db: dbStub }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: state.clerkUserId }),
}));

const sentEmails: Array<{ to: string; subject: string; text: string }> = [];
vi.mock("@/lib/email/send", () => ({
  sendEmail: async (msg: { to: string; subject: string; text: string }) => {
    sentEmails.push(msg);
    return { id: "email_1" };
  },
}));

import { sendInvitationsAction } from "@/server/actions/invite";

beforeEach(() => {
  sentEmails.length = 0;
  state.clerkUserId = "user_inviter";
  state.signerRows = [{ id: INVITER_ID, displayName: "Ada Lovelace" }];
  process.env.NEXT_PUBLIC_SITE_URL = SITE_URL;
});

/** Every absolute site URL in the invitation body, in order of appearance. */
function siteLinks(text: string): string[] {
  return [...text.matchAll(/https:\/\/ai-for-people\.org\S*/g)].map((m) => m[0]);
}

async function invite(to = "friend@example.com") {
  const res = await sendInvitationsAction([to]);
  expect(res.sent).toBe(1);
  const mail = sentEmails.find((m) => m.to === to);
  expect(mail).toBeDefined();
  return mail!;
}

describe("sendInvitationsAction — share attribution", () => {
  it("tags the inviter's signature-page link with their ref and the invite channel", async () => {
    const mail = await invite();
    const link = siteLinks(mail.text).find((u) =>
      u.startsWith(`${SITE_URL}/signatories/`),
    );
    expect(link).toBeDefined();
    expect(link).toContain(`${REF_PARAM}=${INVITER_ID}`);
    expect(link).toContain(`${CHANNEL_PARAM}=invite`);
  });

  it("tags the 'read it for yourself' homepage link too", async () => {
    // The link most invitees actually click — it is the top of the funnel for
    // this channel, and it was carrying nothing at all.
    const mail = await invite();
    const link = siteLinks(mail.text).find(
      (u) => !u.startsWith(`${SITE_URL}/signatories/`),
    );
    expect(link).toBeDefined();
    expect(link).toContain(`${REF_PARAM}=${INVITER_ID}`);
    expect(link).toContain(`${CHANNEL_PARAM}=invite`);
  });

  /**
   * The mirror of the confirmation email's "still refs the three share
   * buttons" case. BOTH links in this email go to a third party — there is no
   * self-directed link to exempt — so a bare, untagged URL anywhere in the
   * body is a leak, not a deliberate carve-out.
   */
  it("leaves no untagged bare URL anywhere in the invitation", async () => {
    const mail = await invite();
    const links = siteLinks(mail.text);
    expect(links.length).toBeGreaterThanOrEqual(2);
    for (const link of links) {
      expect(link).toContain(`${REF_PARAM}=${INVITER_ID}`);
      expect(link).toContain(`${CHANNEL_PARAM}=invite`);
    }
  });

  it("uses a channel the landing side will actually accept", async () => {
    // A `?via=` the parser rejects is the same as no `?via=` at all: the
    // arrival falls out of `shouldReportLanding` into the unattributed bucket.
    const mail = await invite();
    const via = /[?&]via=([^&\s]+)/.exec(siteLinks(mail.text)[0])![1];
    expect(isShareChannel(decodeURIComponent(via))).toBe(true);
  });

  it("sends nothing when the caller is not signed in", async () => {
    state.clerkUserId = null;
    const res = await sendInvitationsAction(["friend@example.com"]);
    expect(res.sent).toBe(0);
    expect(sentEmails).toHaveLength(0);
  });

  it("sends nothing when the caller has no signer row to attribute to", async () => {
    // No row means no id to put in `?ref=`. Sending an untagged invitation
    // anyway is the failure mode this whole file is about, so the action
    // refuses instead.
    state.signerRows = [];
    const res = await sendInvitationsAction(["friend@example.com"]);
    expect(res.sent).toBe(0);
    expect(sentEmails).toHaveLength(0);
  });
});
