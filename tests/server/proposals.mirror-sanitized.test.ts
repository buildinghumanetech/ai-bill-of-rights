/**
 * The GitHub mirror is a PUBLIC surface: it opens an issue on a repo anyone can
 * read. It used to build that issue by reading `formData` a second time, while
 * the database was given the output of `sanitizeProposalText` — so the mirrored
 * issue could carry control characters and text past the length limits that
 * appear nowhere on the site, and the two representations of one proposal could
 * disagree indefinitely with nothing comparing them.
 *
 * These drive the REAL server action against a real pglite database, with only
 * Clerk, the mirror and `revalidatePath` mocked, and assert on the payload the
 * mirror actually receives. Reverting the mirror call in
 * `src/server/actions/proposals.ts` to `String(formData.get(...))` turns them
 * red — which is the point. Asserting against `sanitizeProposalText`'s own
 * output at the call site would be a tautology; asserting that the mirror and
 * the stored row agree is the real invariant.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import Module from "node:module";
import { eq } from "drizzle-orm";
import { createTestDb } from "../_helpers/pglite-db";
import { proposalUpvotes, proposedEdits, signers, versions } from "@/lib/db/schema";
import { syncVersions } from "@/lib/db/sync";
import { BODY_MAX, TITLE_MAX } from "@/lib/proposals/validate";
import { LICENSE_FIELD, PROPOSAL_LICENSE } from "@/lib/proposals/license";

const sampleMarkdown = `---
version: 1.0.0
published_at: 2026-05-18
---

# T {#preamble}
x {#preamble-s-1}
`;

/**
 * Hoisted alongside the mutable state, for the reason spelled out in
 * tests/server/invite.share-attribution.test.ts: `vi.mock` factories are lifted
 * above every module-scope `const`, so a factory closing over one is only safe
 * while nothing in the graph statically imports `@/lib/db`.
 */
const state = vi.hoisted(() => ({
  clerkUserId: null as string | null,
  db: null as unknown,
}));

/**
 * `@/lib/db/lazy` reaches the client through a lazy CommonJS `require`, which
 * Vite's `@` alias and Vitest's registry know nothing about — patching
 * `Module._load` is the hook underneath `require`. Installed in beforeAll so the
 * patch's lifetime is a symmetric hook pair and cannot leak into later suites in
 * the same worker.
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
}));
vi.mock("next/cache", () => ({
  revalidatePath: () => {},
}));

type MirrorCall = {
  proposalId: string;
  title: string;
  body: string;
  rationale: string;
};
const mirrored: MirrorCall[] = [];
vi.mock("@/lib/github/mirror-proposal", () => ({
  mirrorProposalToGitHub: async (input: MirrorCall) => {
    mirrored.push(input);
  },
}));

import { submitNewRightAction } from "@/server/actions/proposals";

const GOOD = {
  // The licence the form displays; createNewArticleProposal refuses a mismatch
  // rather than stamping one, so every submission here has to carry it.
  [LICENSE_FIELD]: PROPOSAL_LICENSE.id,
  title: "Your Mind Is Not a Customer",
  body:
    "No AI system may present uncertain knowledge with false confidence, or substitute fluent answers for the work of understanding. Where a person is trying to learn, the system must show its uncertainty and support the effort rather than replace it.",
  rationale:
    "Article 4 covers the system acting against you and Article 9 covers your attention. Neither covers a system that serves you so smoothly you stop developing judgment.",
};

/**
 * ONE database for the whole file, created in beforeAll.
 *
 * `getDb()` in `@/lib/db/lazy` memoises the client in a module-scope `let`, so a
 * per-test database is a trap: the first test's client is cached and every later
 * action writes there while the test asserts against its own fresh, empty
 * instance. Sharing one instance and clearing rows between tests is the honest
 * shape — and it also keeps the action's 3-proposals-per-hour limit from firing
 * partway down the file and turning a later assertion into a rate-limit error
 * wearing a validation error's clothes.
 */
async function setup() {
  const db = await createTestDb();
  await syncVersions(db, [
    {
      version: "1.0.0",
      publishedAt: new Date("2026-05-18T00:00:00Z"),
      markdown: sampleMarkdown,
      agentsMd: "stub",
      specJson: "{}",
      isCurrent: true,
      gitCommitSha: null,
    },
  ]);
  const [v] = await db.select().from(versions);
  const [s] = await db
    .insert(signers)
    .values({
      clerkUserId: "u_proposer",
      displayName: "Alice",
      affiliation: null,
      locationText: null,
      verificationMethod: "email",
      verifiedAt: new Date(),
    })
    .returning({ id: signers.id });
  state.db = db;
  state.clerkUserId = "u_proposer";
  return { db, versionId: v.id as string, signerId: s.id as string };
}

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, val] of Object.entries(fields)) fd.set(k, val);
  return fd;
}

let shared: Awaited<ReturnType<typeof setup>>;

beforeAll(async () => {
  shared = await setup();
});

beforeEach(async () => {
  mirrored.length = 0;
  state.db = shared.db;
  state.clerkUserId = "u_proposer";
  // Upvotes first: createNewArticleProposal inserts the proposer's own, and it
  // is an FK onto the row being deleted.
  await shared.db.delete(proposalUpvotes);
  await shared.db.delete(proposedEdits);
});

describe("GitHub mirror payload", () => {
  it("strips control characters the database also strips", async () => {
    const res = await submitNewRightAction(
      form({
        ...GOOD,
        title: `Bell\x07 In\x00 Title`,
        rationale: `${GOOD.rationale}\x1F`,
      }),
    );
    expect(res.ok).toBe(true);
    expect(mirrored).toHaveLength(1);

    const sent = mirrored[0];
    expect(sent.title).toBe("Bell In Title");
    for (const ch of ["\x07", "\x00", "\x1F"]) {
      expect(sent.title).not.toContain(ch);
      expect(sent.body).not.toContain(ch);
      expect(sent.rationale).not.toContain(ch);
    }
  });

  it("truncates to the same limits the database enforces", async () => {
    const longBody = `${GOOD.body} padding.`.repeat(40);
    expect(longBody.length).toBeGreaterThan(BODY_MAX);

    const res = await submitNewRightAction(form({ ...GOOD, body: longBody }));
    expect(res.ok).toBe(true);
    expect(mirrored).toHaveLength(1);

    expect(mirrored[0].body.length).toBe(BODY_MAX);
    expect(mirrored[0].body).not.toBe(longBody);
    expect(mirrored[0].title.length).toBeLessThanOrEqual(TITLE_MAX);
  });

  /** The invariant that matters: the public issue and the row cannot disagree. */
  it("sends exactly what was written to the row", async () => {
    const { db } = shared;
    const res = await submitNewRightAction(
      form({
        ...GOOD,
        title: `Bell\x07 Title`,
        body: `${GOOD.body}\x0B\x0B`,
        rationale: `${GOOD.rationale}\x08`,
      }),
    );
    expect(res.ok).toBe(true);
    expect(mirrored).toHaveLength(1);

    const [row] = await db
      .select({
        title: proposedEdits.title,
        newText: proposedEdits.newText,
        rationale: proposedEdits.rationale,
      })
      .from(proposedEdits)
      .where(eq(proposedEdits.id, res.id!));

    expect(mirrored[0].proposalId).toBe(res.id);
    expect(mirrored[0].title).toBe(row.title);
    expect(mirrored[0].body).toBe(row.newText);
    expect(mirrored[0].rationale).toBe(row.rationale);
  });

  it("does not mirror a submission the validator rejected", async () => {
    const res = await submitNewRightAction(form({ ...GOOD, body: "Too short." }));
    expect(res.ok).toBe(false);
    expect(mirrored).toHaveLength(0);
  });
});

/**
 * The two refusals are different facts about the visitor, and the form offers a
 * different way forward for each. "Sign the Bill of Rights first" said to
 * someone who HAS signed but isn't signed in is wrong, so pin that no session
 * never produces the not-a-signer answer.
 */
describe("signer gate refusals", () => {
  it("no session: says not signed in, never 'sign the Bill of Rights'", async () => {
    state.clerkUserId = null;
    const res = await submitNewRightAction(form(GOOD));
    expect(res.ok).toBe(false);
    expect(res.code).toBe("not_signed_in");
    expect(res.error).not.toMatch(/sign the bill of rights/i);
  });

  it("session with no signer row: says only signers can file", async () => {
    state.clerkUserId = "u_clerk_only";
    const res = await submitNewRightAction(form(GOOD));
    expect(res.ok).toBe(false);
    expect(res.code).toBe("not_signer");
  });
});
