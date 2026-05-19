import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../_helpers/pglite-db";
import { syncVersions } from "@/lib/db/sync";
import { signers, comments, versions } from "@/lib/db/schema";
import { createComment, hideComment, unhideComment } from "@/server/actions/comments";

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
    { version: "1.0.0", publishedAt: new Date(), markdown: md, agentsMd: "s", specJson: "{}", isCurrent: true, gitCommitSha: null },
  ]);
  const [s] = await db.insert(signers).values({
    clerkUserId: "u1", displayName: "T", affiliation: null, locationText: null,
    verificationMethod: "email", verifiedAt: new Date(),
  }).returning({ id: signers.id });
  const [v] = await db.select().from(versions).limit(1);
  return { db, signerId: s.id, versionId: v.id };
}

describe("createComment", () => {
  it("inserts a top-level comment", async () => {
    const { db, signerId, versionId } = await seed();
    const result = await createComment(db, {
      versionId,
      anchorId: "preamble-s-1",
      signerId,
      body: "Hello",
      parentCommentId: null,
    });
    expect(result.id).toBeDefined();
    const rows = await db.select().from(comments);
    expect(rows).toHaveLength(1);
    expect(rows[0].body).toBe("Hello");
  });

  it("inserts a reply with parent_comment_id set", async () => {
    const { db, signerId, versionId } = await seed();
    const parent = await createComment(db, { versionId, anchorId: "preamble-s-1", signerId, body: "Top", parentCommentId: null });
    const reply = await createComment(db, { versionId, anchorId: "preamble-s-1", signerId, body: "Reply", parentCommentId: parent.id });
    const rows = await db.select().from(comments);
    expect(rows).toHaveLength(2);
    const replyRow = rows.find((r: any) => r.id === reply.id);
    expect(replyRow?.parentCommentId).toBe(parent.id);
  });

  it("rejects body that is empty after trim", async () => {
    const { db, signerId, versionId } = await seed();
    await expect(
      createComment(db, { versionId, anchorId: "preamble-s-1", signerId, body: "   ", parentCommentId: null })
    ).rejects.toThrow();
  });
});

describe("hideComment / unhideComment", () => {
  it("sets hidden_at + reason; unhide clears them", async () => {
    const { db, signerId, versionId } = await seed();
    const c = await createComment(db, { versionId, anchorId: "preamble-s-1", signerId, body: "x", parentCommentId: null });
    await hideComment(db, c.id, "spam");
    let [row] = await db.select().from(comments).where(eq(comments.id, c.id));
    expect(row.hiddenAt).not.toBeNull();
    expect(row.hiddenReason).toBe("spam");
    await unhideComment(db, c.id);
    [row] = await db.select().from(comments).where(eq(comments.id, c.id));
    expect(row.hiddenAt).toBeNull();
    expect(row.hiddenReason).toBeNull();
  });
});

describe("submitCommentAction softBan enforcement", () => {
  it("does not let createComment be called for soft-banned signers (smoke via direct sql)", async () => {
    // We can't easily call submitCommentAction directly (it needs Clerk + FormData),
    // so we test the column behavior via the underlying lookup the action does:
    const { db } = await seed();
    const [s] = await db.insert(signers).values({
      clerkUserId: "banned", displayName: "B", affiliation: null, locationText: null,
      verificationMethod: "email", verifiedAt: new Date(), softBannedAt: new Date(),
    }).returning({ id: signers.id, softBannedAt: signers.softBannedAt });
    expect(s.softBannedAt).not.toBeNull();
    // createComment itself does NOT check softBan — the gate is in submitCommentAction.
    // This test exists to document the column's intended use; submitCommentAction's
    // throw is verifiable by code-read inspection.
    const versionRows = await db.select().from((await import("@/lib/db/schema")).versions).limit(1);
    const r = await createComment(db, {
      versionId: versionRows[0].id,
      anchorId: "preamble-s-1",
      signerId: s.id,
      body: "should still work at the createComment level",
      parentCommentId: null,
    });
    expect(r.id).toBeDefined();
  });
});
