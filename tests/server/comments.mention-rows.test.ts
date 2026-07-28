/**
 * `submitCommentAction` driven for real, with only its outside edges mocked.
 *
 * WHY THIS FILE EXISTS. Mention recording was covered by `recordMentions` in
 * `comments.test.ts` — a hand-written *mirror* of this action's notification
 * block. A mirror cannot test two things, and both of them broke:
 *
 *   1. WHEN the rows are written. Highlighting reads `comment_mentions`
 *      (`src/lib/comments/render-mentions.tsx`), and the client calls
 *      `router.refresh()` the instant this action resolves. While the insert sat
 *      in the detached `void (async () => …)()` block, the refetch beat it and a
 *      mention the author had explicitly picked rendered as plain text. A mirror
 *      has no notion of when the action returns, so it cannot see this at all.
 *   2. WHETHER the mirror still matches. It kept a self-mention filter after the
 *      action dropped one, so the suite stayed green while picking your own name
 *      wrote no row — and the composer told you it had.
 *
 * So these tests assert on the database at the moment the action's promise
 * resolves, with the email path deliberately jammed so nothing the background
 * block does can be mistaken for the synchronous write.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "../_helpers/pglite-db";
import { syncVersions } from "@/lib/db/sync";
import { commentMentions, comments, signers, versions } from "@/lib/db/schema";
import {
  MENTION_IDS_FIELD,
  MENTION_SOURCE_COMPOSER,
  MENTION_SOURCE_FIELD,
} from "@/lib/comments/resolved-mentions";

/** Set per test, before the action is imported-and-called. */
let db: TestDb;
let clerkUserId = "u_author";

/**
 * Never settles by default.
 *
 * This is the jam referred to above: the background block cannot get past
 * `await clerkClient()`, so any `comment_mentions` row observed after the action
 * resolves must have been written by the synchronous path. Without it, a
 * regression that moved the insert back into the background block could still
 * win the microtask race against the assertion and look green.
 */
let clerkClientImpl: () => Promise<unknown> = () => new Promise(() => {});

type SendEmailArgs = { to: string; subject: string; text: string; html?: string };
const sendEmail = vi.fn<(opts: SendEmailArgs) => Promise<void>>(async () => {});

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: clerkUserId }),
  clerkClient: () => clerkClientImpl(),
}));
vi.mock("@/lib/db/lazy", () => ({ getDb: () => db }));
vi.mock("@/lib/email/send", () => ({
  sendEmail: (opts: SendEmailArgs) => sendEmail(opts),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
/**
 * Mocked rather than exercised: it runs a raw `countSql` string through the
 * driver, which is a different concern from mention recording and would make
 * every test here depend on that SQL surviving PGlite.
 */
vi.mock("@/lib/ratelimit/enforce", () => ({ enforceRateLimit: async () => {} }));

import { submitCommentAction } from "@/server/actions/comments";

const md = `---
version: 1.0.0
published_at: 2026-05-18
---
# T {#preamble}
x {#preamble-s-1}
`;

async function addSigner(clerkId: string, displayName: string) {
  const [row] = await db
    .insert(signers)
    .values({
      clerkUserId: clerkId,
      displayName,
      affiliation: null,
      locationText: null,
      verificationMethod: "email",
      verifiedAt: new Date(),
    })
    .returning({ id: signers.id, displayName: signers.displayName });
  return row;
}

async function seed() {
  db = await createTestDb();
  await syncVersions(db, [
    {
      version: "1.0.0",
      publishedAt: new Date(),
      markdown: md,
      agentsMd: "stub",
      specJson: "{}",
      isCurrent: true,
      gitCommitSha: null,
    },
  ]);
  const [v] = await db.select().from(versions);
  const author = await addSigner("u_author", "Author");
  return { versionId: v.id, author };
}

/** A submission shaped the way a real composer shapes it. */
function composerForm(opts: {
  versionId: string;
  body: string;
  signerIds?: string[];
  fromComposer?: boolean;
}): FormData {
  const fd = new FormData();
  fd.set("baseVersionId", opts.versionId);
  fd.set("anchorId", "preamble-s-1");
  fd.set("body", opts.body);
  if (opts.fromComposer !== false) {
    fd.set(MENTION_SOURCE_FIELD, MENTION_SOURCE_COMPOSER);
  }
  for (const id of opts.signerIds ?? []) fd.append(MENTION_IDS_FIELD, id);
  return fd;
}

function rowsFor(commentId: string) {
  return db
    .select({ signerId: commentMentions.mentionedSignerId })
    .from(commentMentions)
    .where(eq(commentMentions.commentId, commentId));
}

beforeEach(() => {
  clerkUserId = "u_author";
  clerkClientImpl = () => new Promise(() => {});
  sendEmail.mockClear();
});

describe("submitCommentAction mention rows", () => {
  it("does not resolve until the mention rows are committed", async () => {
    // THE ORDERING PROPERTY, and the whole reason this file exists.
    //
    // It is asserted by GATING the insert, not by reading the table afterwards.
    // The first version of this test did the latter and was worthless: it passed
    // with the insert moved back into the detached block, because a deferred
    // insert is still *initiated* synchronously — `await db.insert(...)` is the
    // block's first await — so the row lands microseconds later and long before
    // any in-process assertion. The real defect was never "the insert starts
    // late"; it was that the action did not AWAIT it, so the HTTP response
    // returned before the row was committed and the client's `router.refresh()`
    // won the race over a network round-trip. That race cannot be reproduced in
    // one process, so it has to be tested as the property that causes it.
    //
    // Here the mention insert cannot complete until `release()` is called. If the
    // action awaits it, the action is still pending; if it fires and forgets, the
    // action resolves and this fails.
    const { versionId } = await seed();
    const alice = await addSigner("u_alice", "Alice Nguyen");

    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const realInsert = db.insert.bind(db) as typeof db.insert;
    const insert = vi.spyOn(db, "insert").mockImplementation(((table: unknown) => {
      if (table !== commentMentions) return realInsert(table as never);
      const builder = realInsert(table as never) as unknown as {
        values: (v: unknown) => { onConflictDoNothing: () => Promise<unknown> };
      };
      return {
        values: (v: unknown) => {
          const q = builder.values(v);
          return { onConflictDoNothing: () => gate.then(() => q.onConflictDoNothing()) };
        },
      } as unknown as ReturnType<typeof db.insert>;
    }) as typeof db.insert);

    const pending = submitCommentAction(
      composerForm({
        versionId,
        body: "thanks @Alice Nguyen for the review",
        signerIds: [alice.id],
      }),
    );

    // Generous relative to any microtask chain, so "still pending" means the
    // action is genuinely waiting on the insert rather than merely slower.
    const raced = await Promise.race([
      pending.then(() => "resolved" as const),
      new Promise<"pending">((r) => setTimeout(() => r("pending"), 50)),
    ]);
    expect(raced).toBe("pending");

    release();
    const res = await pending;
    insert.mockRestore();

    expect(res.ok).toBe(true);
    expect(await rowsFor(res.id!)).toEqual([{ signerId: alice.id }]);
    // The email path is jammed, so nothing the background block does could have
    // produced that row.
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("records a self-mention", async () => {
    // The action filtered self-mentions BEFORE inserting, and returned early
    // when that emptied the list, so picking your own name wrote nothing while
    // the composer's "Notifying …" line said otherwise. The row means "this was
    // a mention", which is true of yourself; not mailing you is separate.
    const { versionId, author } = await seed();

    const res = await submitCommentAction(
      composerForm({
        versionId,
        body: `note to self @${author.displayName}`,
        signerIds: [author.id],
      }),
    );

    expect(await rowsFor(res.id!)).toEqual([{ signerId: author.id }]);
  });

  it("records both when two people are mentioned", async () => {
    const { versionId } = await seed();
    const alice = await addSigner("u_alice", "Alice Nguyen");
    const bob = await addSigner("u_bob", "Bob Smith");

    const res = await submitCommentAction(
      composerForm({
        versionId,
        body: "@Alice Nguyen and @Bob Smith please look",
        signerIds: [alice.id, bob.id],
      }),
    );

    const got = (await rowsFor(res.id!)).map((r) => r.signerId).sort();
    expect(got).toEqual([alice.id, bob.id].sort());
  });

  it("writes nothing when the submission carries no composer marker", async () => {
    // A hand-rolled POST. There is deliberately no prose-parsing fallback, so
    // "no resolution" means "nobody" — including no row, hence no highlight.
    const { versionId } = await seed();
    const alice = await addSigner("u_alice", "Alice Nguyen");

    const res = await submitCommentAction(
      composerForm({
        versionId,
        body: "thanks @Alice Nguyen",
        signerIds: [alice.id],
        fromComposer: false,
      }),
    );

    expect(res.ok).toBe(true);
    expect(await rowsFor(res.id!)).toEqual([]);
  });

  it("writes nothing when the composer resolved and found nobody", async () => {
    // Distinct from the case above: the marker IS set, so the client did resolve
    // — it just had no picks, because the author typed the name by hand. That is
    // the ordinary path for a hand-typed name, and it must leave no row, which is
    // what stops `render-mentions` styling it.
    const { versionId } = await seed();
    await addSigner("u_alice", "Alice Nguyen");

    const res = await submitCommentAction(
      composerForm({ versionId, body: "thanks @Alice Nguyen", signerIds: [] }),
    );

    expect(res.ok).toBe(true);
    expect(await rowsFor(res.id!)).toEqual([]);
  });

  it("does not duplicate rows when the same signer is picked twice", async () => {
    // `onConflictDoNothing` against the `comment_mentions_unique` index. Two
    // picks of one name is ordinary composer behaviour.
    const { versionId } = await seed();
    const alice = await addSigner("u_alice", "Alice Nguyen");

    const res = await submitCommentAction(
      composerForm({
        versionId,
        body: "@Alice Nguyen ping @Alice Nguyen",
        signerIds: [alice.id, alice.id],
      }),
    );

    expect(await rowsFor(res.id!)).toEqual([{ signerId: alice.id }]);
  });

  it("writes nothing for a signer whose name is not in the body", async () => {
    // The forgery guard, at the action rather than in a mirror of it: ids arrive
    // from the browser, so a row requires the name to actually be in the comment.
    // `bob!@alice.com` is the body that made the old parser email Alice.
    const { versionId } = await seed();
    const alice = await addSigner("u_alice", "Alice Nguyen");

    const res = await submitCommentAction(
      composerForm({
        versionId,
        body: "write bob!@alice.com, then cc me",
        signerIds: [alice.id],
      }),
    );

    expect(await rowsFor(res.id!)).toEqual([]);
  });

  it("still stores the comment when recording the rows fails", async () => {
    // The insert is on the critical path now, so its failure mode matters: the
    // comment is already written and must not be lost to a mention problem. This
    // is the branch the mirror could not model at all.
    const { versionId } = await seed();
    const alice = await addSigner("u_alice", "Alice Nguyen");
    // Fail ONLY the mention insert. `mockImplementationOnce` is wrong here: the
    // first insert this action reaches is the comment itself, so a blanket
    // one-shot failure tests "the comment write failed", which is a different
    // claim entirely — and it is what this test asserted on its first run.
    const realInsert = db.insert.bind(db) as typeof db.insert;
    const insert = vi.spyOn(db, "insert").mockImplementation(((table: unknown) => {
      if (table === commentMentions) throw new Error("mention insert exploded");
      return realInsert(table as never);
    }) as typeof db.insert);

    const res = await submitCommentAction(
      composerForm({
        versionId,
        body: "thanks @Alice Nguyen",
        signerIds: [alice.id],
      }),
    );
    insert.mockRestore();

    expect(res.ok).toBe(true);
    const stored = await db.select().from(comments).where(eq(comments.id, res.id!));
    expect(stored).toHaveLength(1);
    expect(await rowsFor(res.id!)).toEqual([]);
  });

  it("mails the mentioned signer but not the author", async () => {
    // The delivery half, once the background block is allowed to run: the
    // self-filter lives there and only there.
    const { versionId, author } = await seed();
    const alice = await addSigner("u_alice", "Alice Nguyen");
    clerkClientImpl = async () => ({
      users: {
        getUser: async () => ({
          primaryEmailAddress: { emailAddress: "alice@example.com" },
          emailAddresses: [{ emailAddress: "alice@example.com" }],
          phoneNumbers: [],
        }),
      },
    });

    const res = await submitCommentAction(
      composerForm({
        versionId,
        body: `@Alice Nguyen and @${author.displayName} see this`,
        signerIds: [alice.id, author.id],
      }),
    );

    // Both rows, because both were picked and both names are present.
    expect((await rowsFor(res.id!)).map((r) => r.signerId).sort()).toEqual(
      [alice.id, author.id].sort(),
    );
    // Let the detached block finish.
    await vi.waitFor(() => expect(sendEmail).toHaveBeenCalledTimes(1));
    expect(sendEmail.mock.calls[0][0]).toMatchObject({ to: "alice@example.com" });
  });
});
