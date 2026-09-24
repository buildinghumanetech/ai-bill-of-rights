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
  signerShareUrl,
} from "@/lib/share/urls";

const SITE_URL = "https://ai-for-people.org";
/**
 * The origin share links are WRITTEN with, which is not necessarily SITE_URL:
 * production links go out on the short share domain (see `shareOrigin` in
 * src/lib/share/urls.ts). Derived rather than hard-coded so this file tests
 * attribution, not which domain is in fashion.
 */
const LINK_ORIGIN = new URL(signerShareUrl(SITE_URL, "x")).origin;
const INVITER_ID = "eeeb0d40-7bee-4bc9-8808-fecb955a8db0";

/**
 * Mutable state lives INSIDE `vi.hoisted`, not in module-scope `const`s below
 * the mocks: `vi.mock` factories and the `import` of the action under test are
 * both hoisted above every `const` in this file, so a factory closing over a
 * module-scope binding throws `ReferenceError: Cannot access ... before
 * initialization` the day `invite.ts` swaps its lazy `require` for a normal
 * `import`.
 *
 * `db` is a fresh pglite database per test (seeded with the inviter's signer
 * row). It used to be a hand-rolled stub of the one `select` chain the action
 * ran; the action now also claims each address in `invitations` (see
 * invite.once-per-person.test.ts), and a real database is simpler and more
 * honest than stubbing an insert/on-conflict/returning chain.
 */
const state = vi.hoisted(() => {
  const s = {
    clerkUserId: null as string | null,
    /** This test's database. */
    current: null as unknown,
    /**
     * What `require("@/lib/db").db` hands the action. `invite.ts` memoises the
     * first db it gets for the life of the module, so it must be one stable
     * object that forwards to whichever database the current test built —
     * otherwise every test after the first runs against the first test's db.
     */
    db: null as unknown,
  };
  s.db = new Proxy(
    {},
    {
      get(_t, prop) {
        const target = s.current as Record<string | symbol, unknown>;
        const v = target[prop];
        return typeof v === "function" ? v.bind(target) : v;
      },
    },
  );
  return s;
});

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
    if (request === "@/lib/db") return { db: state.db };
    return originalLoad.call(this, request, ...rest);
  } as typeof originalLoad;
});
afterAll(() => {
  loader._load = originalLoad;
});

vi.mock("@/lib/db", () => ({
  get db() {
    return state.db;
  },
}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: state.clerkUserId }),
  // Nobody the tests invite has a Clerk account, so nobody is already-signed.
  clerkClient: async () => ({
    users: { getUserList: async () => ({ data: [], totalCount: 0 }) },
  }),
}));

const sentEmails: Array<{ to: string; subject: string; text: string }> = [];
vi.mock("@/lib/email/send", () => ({
  sendEmail: async (msg: { to: string; subject: string; text: string }) => {
    sentEmails.push(msg);
    return { id: "email_1" };
  },
}));

import { sendInvitationsAction } from "@/server/actions/invite";
import { createTestDb } from "../_helpers/pglite-db";
import { signers } from "@/lib/db/schema";
import { resolveShareSlug } from "@/lib/share/short-links";
import { sql } from "drizzle-orm";

/**
 * `process.env` is ONE object shared by every file in a Vitest worker, so
 * setting `NEXT_PUBLIC_SITE_URL` here without restoring it leaks this file's
 * origin into whatever suite runs next in the same worker — the same
 * cross-file-state class as the jsdom clipboard stub this branch already
 * fixed. `vi.stubEnv` records the previous value; `vi.unstubAllEnvs` in
 * `afterAll` puts it back (or deletes it if it was never set), keeping the hook
 * pair symmetric like the `Module._load` patch above.
 */
afterAll(() => {
  vi.unstubAllEnvs();
});

beforeEach(async () => {
  sentEmails.length = 0;
  state.clerkUserId = "user_inviter";
  const db = await createTestDb();
  await db.insert(signers).values({
    id: INVITER_ID,
    clerkUserId: "user_inviter",
    displayName: "Ada Lovelace",
    verificationMethod: "email",
    verifiedAt: new Date(),
  });
  state.current = db;
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", SITE_URL);
});

/** Every absolute site URL in the invitation body, in order of appearance. */
function siteLinks(text: string): string[] {
  const origin = LINK_ORIGIN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [...text.matchAll(new RegExp(`${origin}\\S*`, "g"))].map((m) => m[0]);
}

async function invite(to = "friend@example.com") {
  const res = await sendInvitationsAction([to]);
  expect(res.sent).toEqual([to]);
  const mail = sentEmails.find((m) => m.to === to);
  expect(mail).toBeDefined();
  return mail!;
}

describe("sendInvitationsAction — share attribution", () => {
  it("links the inviter's signature page through their short link, tagged invite", async () => {
    const mail = await invite();
    const link = siteLinks(mail.text).find((u) => u.startsWith(`${LINK_ORIGIN}/s/`));
    expect(link).toBeDefined();
    expect(link).toContain(`${CHANNEL_PARAM}=invite`);
    // No raw id in the link; the slug resolves to the inviter, and /s/[slug]
    // redirects with ?ref=<inviter>, so attribution is unchanged.
    expect(link).not.toContain(INVITER_ID);
    const slug = new URL(link!).pathname.split("/")[2];
    expect(await resolveShareSlug(state.current, slug)).toBe(INVITER_ID);
  });

  it("falls back to the long, ref-tagged link when share_links is missing (0014 unapplied)", async () => {
    await (state.current as { execute: (q: unknown) => Promise<unknown> }).execute(
      sql`DROP TABLE share_links`,
    );
    const mail = await invite();
    const link = siteLinks(mail.text).find((u) =>
      u.startsWith(`${LINK_ORIGIN}/signatories/`),
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
      (u) => !u.startsWith(`${LINK_ORIGIN}/signatories/`),
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
      expect(link).toContain(`${CHANNEL_PARAM}=invite`);
      // Either it names the inviter as ref, or it is their short link, which
      // resolves to them and redirects with ?ref= on the far side.
      if (new URL(link).pathname.startsWith("/s/")) {
        const slug = new URL(link).pathname.split("/")[2];
        expect(await resolveShareSlug(state.current, slug)).toBe(INVITER_ID);
      } else {
        expect(link).toContain(`${REF_PARAM}=${INVITER_ID}`);
      }
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
    expect(res.sent).toEqual([]);
    expect(sentEmails).toHaveLength(0);
  });

  it("sends nothing when the caller has no signer row to attribute to", async () => {
    // No row means no id to put in `?ref=`. Sending an untagged invitation
    // anyway is the failure mode this whole file is about, so the action
    // refuses instead.
    state.clerkUserId = "user_without_a_signer_row";
    const res = await sendInvitationsAction(["friend@example.com"]);
    expect(res.sent).toEqual([]);
    expect(sentEmails).toHaveLength(0);
  });
});
