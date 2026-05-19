import { describe, expect, it } from "vitest";
import { createTestDb } from "../_helpers/pglite-db";
import { syncVersions } from "@/lib/db/sync";
import { signers, commentUpvotes, versions } from "@/lib/db/schema";
import { toggleUpvote } from "@/server/actions/upvotes";
import { createComment } from "@/server/actions/comments";

const md = `---
version: 1.0.0
published_at: 2026-05-18
---
# T {#preamble}
x {#preamble-s-1}
`;

async function seed() {
  const db = await createTestDb();
  await syncVersions(db, [{ version: "1.0.0", publishedAt: new Date(), markdown: md, agentsMd: "s", specJson: "{}", isCurrent: true, gitCommitSha: null }]);
  const [s] = await db.insert(signers).values({
    clerkUserId: "u1", displayName: "T", affiliation: null, locationText: null,
    verificationMethod: "email", verifiedAt: new Date(),
  }).returning({ id: signers.id });
  const [v] = await db.select().from(versions).limit(1);
  const c = await createComment(db, { versionId: v.id, anchorId: "preamble-s-1", signerId: s.id, body: "x", parentCommentId: null });
  return { db, signerId: s.id, commentId: c.id };
}

describe("toggleUpvote", () => {
  it("adds an upvote on first call", async () => {
    const { db, signerId, commentId } = await seed();
    const r = await toggleUpvote(db, commentId, signerId);
    expect(r.upvoted).toBe(true);
    const rows = await db.select().from(commentUpvotes);
    expect(rows).toHaveLength(1);
  });
  it("removes the upvote on second call", async () => {
    const { db, signerId, commentId } = await seed();
    await toggleUpvote(db, commentId, signerId);
    const r = await toggleUpvote(db, commentId, signerId);
    expect(r.upvoted).toBe(false);
    const rows = await db.select().from(commentUpvotes);
    expect(rows).toHaveLength(0);
  });
});
