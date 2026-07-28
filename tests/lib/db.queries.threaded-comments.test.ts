import { describe, expect, it } from "vitest";
import { createTestDb } from "../_helpers/pglite-db";
import { syncVersions } from "@/lib/db/sync";
import { commentVotes, commentReports, comments, commentMentions, signers, versions } from "@/lib/db/schema";
import {
  listThreadedCommentsForVersion,
  findCommentInTree,
  flattenTree,
} from "@/lib/db/queries";

const md = `---
version: 1.0.0
published_at: 2026-05-18
---
# T {#preamble}
x {#preamble-s-1}
`;

async function seed() {
  const db = await createTestDb();
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
  const [alice] = await db
    .insert(signers)
    .values({
      clerkUserId: "alice",
      displayName: "Alice",
      affiliation: null,
      locationText: null,
      verificationMethod: "email",
      verifiedAt: new Date(),
    })
    .returning({ id: signers.id });
  const [bob] = await db
    .insert(signers)
    .values({
      clerkUserId: "bob",
      displayName: "Bob",
      affiliation: null,
      locationText: null,
      verificationMethod: "email",
      verifiedAt: new Date(),
    })
    .returning({ id: signers.id });
  return { db, versionId: v.id, aliceId: alice.id, bobId: bob.id };
}

describe("listThreadedCommentsForVersion", () => {
  it("returns empty array when no comments exist", async () => {
    const { db, versionId } = await seed();
    const tree = await listThreadedCommentsForVersion(db, versionId, null);
    expect(tree).toHaveLength(0);
  });

  it("returns top-level comments as roots", async () => {
    const { db, versionId, aliceId } = await seed();
    await db.insert(comments).values([
      { baseVersionId: versionId, anchorId: "preamble-s-1", signerId: aliceId, body: "root1" },
      { baseVersionId: versionId, anchorId: "preamble-s-1", signerId: aliceId, body: "root2" },
    ]);
    const tree = await listThreadedCommentsForVersion(db, versionId, null);
    expect(tree).toHaveLength(2);
    expect(tree.every((n) => n.replies.length === 0)).toBe(true);
  });

  it("attaches replies under their parent", async () => {
    const { db, versionId, aliceId, bobId } = await seed();
    const [root] = await db
      .insert(comments)
      .values({ baseVersionId: versionId, anchorId: "preamble-s-1", signerId: aliceId, body: "root" })
      .returning({ id: comments.id });
    await db.insert(comments).values({
      baseVersionId: versionId,
      anchorId: "preamble-s-1",
      signerId: bobId,
      body: "reply",
      parentCommentId: root.id,
    });
    const tree = await listThreadedCommentsForVersion(db, versionId, null);
    expect(tree).toHaveLength(1);
    expect(tree[0].replies).toHaveLength(1);
    expect(tree[0].replies[0].body).toBe("reply");
  });

  it("computes scores correctly from votes", async () => {
    const { db, versionId, aliceId, bobId } = await seed();
    const [root] = await db
      .insert(comments)
      .values({ baseVersionId: versionId, anchorId: "preamble-s-1", signerId: aliceId, body: "root" })
      .returning({ id: comments.id });
    // Bob upvotes, Alice downvotes (from a different comment author POV)
    // But Alice authored it; self-vote prevented at action layer, not query layer.
    await db.insert(commentVotes).values([
      { commentId: root.id, signerId: bobId, direction: 1 },
    ]);
    const tree = await listThreadedCommentsForVersion(db, versionId, null);
    expect(tree[0].score).toBe(1);
  });

  it("sets myVote correctly for a viewer", async () => {
    const { db, versionId, aliceId, bobId } = await seed();
    const [root] = await db
      .insert(comments)
      .values({ baseVersionId: versionId, anchorId: "preamble-s-1", signerId: aliceId, body: "root" })
      .returning({ id: comments.id });
    await db.insert(commentVotes).values({ commentId: root.id, signerId: bobId, direction: -1 });
    const tree = await listThreadedCommentsForVersion(db, versionId, bobId);
    expect(tree[0].myVote).toBe(-1);
  });

  it("returns myVote null when viewer hasn't voted", async () => {
    const { db, versionId, aliceId, bobId } = await seed();
    await db.insert(comments).values({
      baseVersionId: versionId,
      anchorId: "preamble-s-1",
      signerId: aliceId,
      body: "root",
    });
    const tree = await listThreadedCommentsForVersion(db, versionId, bobId);
    expect(tree[0].myVote).toBeNull();
  });

  it("sorts siblings by score desc then createdAt asc", async () => {
    const { db, versionId, aliceId, bobId } = await seed();
    const inserted = await db
      .insert(comments)
      .values([
        { baseVersionId: versionId, anchorId: "preamble-s-1", signerId: aliceId, body: "low" },
        { baseVersionId: versionId, anchorId: "preamble-s-1", signerId: aliceId, body: "high" },
      ])
      .returning({ id: comments.id, body: comments.body });
    // Upvote "high" comment with bob
    const highComment = inserted.find((r) => r.body === "high")!;
    await db.insert(commentVotes).values({ commentId: highComment.id, signerId: bobId, direction: 1 });
    const tree = await listThreadedCommentsForVersion(db, versionId, null);
    expect(tree[0].body).toBe("high");
    expect(tree[1].body).toBe("low");
  });

  it("excludes hidden comments", async () => {
    const { db, versionId, aliceId } = await seed();
    await db.insert(comments).values([
      { baseVersionId: versionId, anchorId: "preamble-s-1", signerId: aliceId, body: "visible" },
      {
        baseVersionId: versionId,
        anchorId: "preamble-s-1",
        signerId: aliceId,
        body: "hidden",
        hiddenAt: new Date(),
      },
    ]);
    const tree = await listThreadedCommentsForVersion(db, versionId, null);
    expect(tree).toHaveLength(1);
    expect(tree[0].body).toBe("visible");
  });

  it("sets myReport true when viewer has flagged the comment", async () => {
    const { db, versionId, aliceId, bobId } = await seed();
    const [c] = await db
      .insert(comments)
      .values({ baseVersionId: versionId, anchorId: "preamble-s-1", signerId: aliceId, body: "root" })
      .returning({ id: comments.id });
    // Bob reports Alice's comment
    await db.insert(commentReports).values({ commentId: c.id, reporterSignerId: bobId });
    const tree = await listThreadedCommentsForVersion(db, versionId, bobId);
    expect(tree[0].myReport).toBe(true);
  });

  it("sets myReport false when viewer has not flagged the comment", async () => {
    const { db, versionId, aliceId, bobId } = await seed();
    await db.insert(comments).values({
      baseVersionId: versionId,
      anchorId: "preamble-s-1",
      signerId: aliceId,
      body: "root",
    });
    const tree = await listThreadedCommentsForVersion(db, versionId, bobId);
    expect(tree[0].myReport).toBe(false);
  });

  it("sets myReport false for a null viewer", async () => {
    const { db, versionId, aliceId, bobId } = await seed();
    const [c] = await db
      .insert(comments)
      .values({ baseVersionId: versionId, anchorId: "preamble-s-1", signerId: aliceId, body: "root" })
      .returning({ id: comments.id });
    await db.insert(commentReports).values({ commentId: c.id, reporterSignerId: bobId });
    // Null viewer: myReport must be false even though bob flagged it
    const tree = await listThreadedCommentsForVersion(db, versionId, null);
    expect(tree[0].myReport).toBe(false);
  });
});

describe("findCommentInTree", () => {
  it("finds a root-level comment by id", async () => {
    const { db, versionId, aliceId } = await seed();
    const [c] = await db
      .insert(comments)
      .values({ baseVersionId: versionId, anchorId: "preamble-s-1", signerId: aliceId, body: "root" })
      .returning({ id: comments.id });
    const tree = await listThreadedCommentsForVersion(db, versionId, null);
    const found = findCommentInTree(tree, c.id);
    expect(found).not.toBeNull();
    expect(found?.body).toBe("root");
  });

  it("finds a nested reply by id", async () => {
    const { db, versionId, aliceId, bobId } = await seed();
    const [root] = await db
      .insert(comments)
      .values({ baseVersionId: versionId, anchorId: "preamble-s-1", signerId: aliceId, body: "root" })
      .returning({ id: comments.id });
    const [reply] = await db
      .insert(comments)
      .values({
        baseVersionId: versionId,
        anchorId: "preamble-s-1",
        signerId: bobId,
        body: "nested reply",
        parentCommentId: root.id,
      })
      .returning({ id: comments.id });
    const tree = await listThreadedCommentsForVersion(db, versionId, null);
    const found = findCommentInTree(tree, reply.id);
    expect(found?.body).toBe("nested reply");
  });

  it("returns null when id doesn't exist in tree", () => {
    const found = findCommentInTree([], "nonexistent-id");
    expect(found).toBeNull();
  });
});

describe("mentionedSignerIds", () => {
  // These rows are what the UI highlights on, so a comment that fails to carry
  // them renders a real mention as plain text. Nothing else in the suite would
  // catch that: `render-mentions` is tested against ids passed in directly.
  it("carries the mention rows for each comment", async () => {
    const { db, versionId, aliceId, bobId } = await seed();
    const [mentioning] = await db
      .insert(comments)
      .values({
        baseVersionId: versionId,
        anchorId: "preamble-s-1",
        signerId: aliceId,
        body: "cc @Bob",
      })
      .returning({ id: comments.id });
    await db
      .insert(comments)
      .values({
        baseVersionId: versionId,
        anchorId: "preamble-s-1",
        signerId: aliceId,
        body: "no mentions here",
      });
    await db
      .insert(commentMentions)
      .values({ commentId: mentioning.id, mentionedSignerId: bobId });

    const flat = flattenTree(await listThreadedCommentsForVersion(db, versionId, null));
    const withMention = flat.find((c) => c.id === mentioning.id);
    const without = flat.find((c) => c.id !== mentioning.id);
    expect(withMention?.mentionedSignerIds).toEqual([bobId]);

    // Absent rows must be an empty array, not undefined — the render path
    // iterates it without a guard.
    expect(without?.mentionedSignerIds).toEqual([]);
  });

  it("collects every signer when one comment mentions two people", async () => {
    // Exercises the accumulate branch in the grouping loop. Without a comment
    // carrying two rows, replacing the push with an overwrite leaves the suite
    // green while a two-person mention highlights only one of them.
    const { db, versionId, aliceId, bobId } = await seed();
    const [c] = await db
      .insert(comments)
      .values({
        baseVersionId: versionId,
        anchorId: "preamble-s-1",
        signerId: aliceId,
        body: "@Alice and @Bob both",
      })
      .returning({ id: comments.id });
    await db.insert(commentMentions).values([
      { commentId: c.id, mentionedSignerId: aliceId },
      { commentId: c.id, mentionedSignerId: bobId },
    ]);

    const flat = flattenTree(await listThreadedCommentsForVersion(db, versionId, null));
    // Row order is not guaranteed, so compare as a set.
    expect([...(flat[0]?.mentionedSignerIds ?? [])].sort()).toEqual(
      [aliceId, bobId].sort(),
    );
  });

  it("keeps each comment's rows separate when several mention people", async () => {
    // One shared query feeds every comment, so a grouping bug here would leak
    // one comment's mentions onto another and highlight names nobody picked.
    const { db, versionId, aliceId, bobId } = await seed();
    const [first] = await db
      .insert(comments)
      .values({ baseVersionId: versionId, anchorId: "preamble-s-1", signerId: aliceId, body: "@Bob one" })
      .returning({ id: comments.id });
    const [second] = await db
      .insert(comments)
      .values({ baseVersionId: versionId, anchorId: "preamble-s-1", signerId: bobId, body: "@Alice two" })
      .returning({ id: comments.id });
    await db.insert(commentMentions).values([
      { commentId: first.id, mentionedSignerId: bobId },
      { commentId: second.id, mentionedSignerId: aliceId },
    ]);

    const flat = flattenTree(await listThreadedCommentsForVersion(db, versionId, null));
    expect(flat.find((c) => c.id === first.id)?.mentionedSignerIds).toEqual([bobId]);
    expect(flat.find((c) => c.id === second.id)?.mentionedSignerIds).toEqual([aliceId]);
  });
});

describe("flattenTree", () => {
  it("flattens a nested tree depth-first", async () => {
    const { db, versionId, aliceId, bobId } = await seed();
    const [root] = await db
      .insert(comments)
      .values({ baseVersionId: versionId, anchorId: "preamble-s-1", signerId: aliceId, body: "root" })
      .returning({ id: comments.id });
    await db.insert(comments).values({
      baseVersionId: versionId,
      anchorId: "preamble-s-1",
      signerId: bobId,
      body: "child",
      parentCommentId: root.id,
    });
    const tree = await listThreadedCommentsForVersion(db, versionId, null);
    const flat = flattenTree(tree);
    expect(flat).toHaveLength(2);
    expect(flat[0].body).toBe("root");
    expect(flat[1].body).toBe("child");
  });
});
