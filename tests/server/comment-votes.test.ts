import { describe, expect, it } from "vitest";
import { createTestDb } from "../_helpers/pglite-db";
import { syncVersions } from "@/lib/db/sync";
import { commentVotes, comments, signers, versions } from "@/lib/db/schema";
import { voteOnComment } from "@/server/actions/comment-votes";

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
  const [author] = await db
    .insert(signers)
    .values({
      clerkUserId: "author",
      displayName: "Author",
      affiliation: null,
      locationText: null,
      verificationMethod: "email",
      verifiedAt: new Date(),
    })
    .returning({ id: signers.id });
  const [voter] = await db
    .insert(signers)
    .values({
      clerkUserId: "voter",
      displayName: "Voter",
      affiliation: null,
      locationText: null,
      verificationMethod: "email",
      verifiedAt: new Date(),
    })
    .returning({ id: signers.id });
  const [c] = await db
    .insert(comments)
    .values({
      baseVersionId: v.id,
      anchorId: "preamble-s-1",
      signerId: author.id,
      body: "nice comment",
    })
    .returning({ id: comments.id });
  return { db, commentId: c.id, voterId: voter.id };
}

describe("voteOnComment", () => {
  it("inserts an upvote row and returns 'added'", async () => {
    const { db, commentId, voterId } = await seed();
    const res = await voteOnComment(db, { signerId: voterId, commentId, direction: 1 });
    expect(res.state).toBe("added");
    const rows = await db.select().from(commentVotes);
    expect(rows).toHaveLength(1);
    expect(rows[0].direction).toBe(1);
  });

  it("removes a matching vote on second call (toggle off) and returns 'removed'", async () => {
    const { db, commentId, voterId } = await seed();
    await voteOnComment(db, { signerId: voterId, commentId, direction: 1 });
    const res = await voteOnComment(db, { signerId: voterId, commentId, direction: 1 });
    expect(res.state).toBe("removed");
    const rows = await db.select().from(commentVotes);
    expect(rows).toHaveLength(0);
  });

  it("updates direction when switching from up to down and returns 'switched'", async () => {
    const { db, commentId, voterId } = await seed();
    await voteOnComment(db, { signerId: voterId, commentId, direction: 1 });
    const res = await voteOnComment(db, { signerId: voterId, commentId, direction: -1 });
    expect(res.state).toBe("switched");
    const rows = await db.select().from(commentVotes);
    expect(rows).toHaveLength(1);
    expect(rows[0].direction).toBe(-1);
  });

  it("inserts a downvote row and returns 'added'", async () => {
    const { db, commentId, voterId } = await seed();
    const res = await voteOnComment(db, { signerId: voterId, commentId, direction: -1 });
    expect(res.state).toBe("added");
    const rows = await db.select().from(commentVotes);
    expect(rows).toHaveLength(1);
    expect(rows[0].direction).toBe(-1);
  });
});
