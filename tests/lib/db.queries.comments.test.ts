import { describe, expect, it } from "vitest";
import { createTestDb } from "../_helpers/pglite-db";
import { syncVersions } from "@/lib/db/sync";
import { comments, signers, versions } from "@/lib/db/schema";
import {
  countCommentsByAnchor,
  listCommentsForAnchor,
} from "@/lib/db/queries";

const md = `---
version: 1.0.0
published_at: 2026-05-18
---
# T {#preamble}
x {#preamble-s-1}
y {#preamble-s-2}
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
  return { db, versionId: v.id, signerId: s.id };
}

describe("countCommentsByAnchor", () => {
  it("returns a map of anchorId -> count of visible comments", async () => {
    const { db, versionId, signerId } = await seed();
    await db.insert(comments).values([
      { baseVersionId: versionId, anchorId: "preamble-s-1", signerId, body: "a" },
      { baseVersionId: versionId, anchorId: "preamble-s-1", signerId, body: "b" },
      { baseVersionId: versionId, anchorId: "preamble-s-2", signerId, body: "c" },
      { baseVersionId: versionId, anchorId: "preamble-s-1", signerId, body: "d", hiddenAt: new Date() },
    ]);
    const counts = await countCommentsByAnchor(db, versionId);
    expect(counts).toEqual({
      "preamble-s-1": 2,
      "preamble-s-2": 1,
    });
  });
});

describe("listCommentsForAnchor", () => {
  it("returns visible comments for a specific anchor, joined with display name, newest last", async () => {
    const { db, versionId, signerId } = await seed();
    await db.insert(comments).values([
      { baseVersionId: versionId, anchorId: "preamble-s-1", signerId, body: "first" },
      { baseVersionId: versionId, anchorId: "preamble-s-1", signerId, body: "second" },
      { baseVersionId: versionId, anchorId: "preamble-s-2", signerId, body: "other" },
    ]);
    const rows = await listCommentsForAnchor(db, versionId, "preamble-s-1");
    expect(rows).toHaveLength(2);
    expect(rows[0].body).toBe("first");
    expect(rows[1].body).toBe("second");
    expect(rows[0].displayName).toBe("X");
  });
});
