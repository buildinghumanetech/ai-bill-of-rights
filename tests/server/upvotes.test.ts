import { describe, expect, it } from "vitest";
import { createTestDb } from "../_helpers/pglite-db";
import { syncVersions } from "@/lib/db/sync";
import {
  commentUpvotes,
  comments,
  signers,
  versions,
} from "@/lib/db/schema";
import { toggleCommentUpvote } from "@/server/actions/upvotes";

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
  const [s] = await db
    .insert(signers)
    .values({
      clerkUserId: "u1",
      displayName: "X",
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
      signerId: s.id,
      body: "x",
    })
    .returning({ id: comments.id });
  return { db, commentId: c.id, signerId: s.id };
}

describe("toggleCommentUpvote", () => {
  it("inserts an upvote when none exists", async () => {
    const { db, commentId, signerId } = await seed();
    const result = await toggleCommentUpvote(db, { commentId, signerId });
    expect(result.state).toBe("upvoted");
    const rows = await db.select().from(commentUpvotes);
    expect(rows).toHaveLength(1);
  });
  it("removes the upvote on the second call", async () => {
    const { db, commentId, signerId } = await seed();
    await toggleCommentUpvote(db, { commentId, signerId });
    const result = await toggleCommentUpvote(db, { commentId, signerId });
    expect(result.state).toBe("removed");
    const rows = await db.select().from(commentUpvotes);
    expect(rows).toHaveLength(0);
  });
});
