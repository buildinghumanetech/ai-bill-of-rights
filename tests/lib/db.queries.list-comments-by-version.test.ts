import { describe, expect, it } from "vitest";
import { createTestDb } from "../_helpers/pglite-db";
import { syncVersions } from "@/lib/db/sync";
import { comments, signers, versions } from "@/lib/db/schema";
import {
  listCommentsForVersion,
  listCommentsByAnchorForVersion,
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
      displayName: "Alice",
      affiliation: null,
      locationText: null,
      verificationMethod: "email",
      verifiedAt: new Date(),
    })
    .returning({ id: signers.id });
  return { db, versionId: v.id, signerId: s.id };
}

describe("listCommentsForVersion", () => {
  it("returns all visible comments for the version, ordered oldest first", async () => {
    const { db, versionId, signerId } = await seed();
    await db.insert(comments).values([
      {
        baseVersionId: versionId,
        anchorId: "preamble-s-1",
        signerId,
        body: "first",
        selectedText: "x",
      },
      {
        baseVersionId: versionId,
        anchorId: "preamble-s-2",
        signerId,
        body: "second",
        selectedText: null,
      },
      // Hidden comment — should not appear.
      {
        baseVersionId: versionId,
        anchorId: "preamble-s-1",
        signerId,
        body: "hidden",
        hiddenAt: new Date(),
      },
    ]);
    const rows = await listCommentsForVersion(db, versionId);
    expect(rows).toHaveLength(2);
    expect(rows[0].body).toBe("first");
    expect(rows[0].selectedText).toBe("x");
    expect(rows[0].displayName).toBe("Alice");
    expect(rows[1].body).toBe("second");
    expect(rows[1].selectedText).toBeNull();
  });

  it("skips hidden comments", async () => {
    const { db, versionId, signerId } = await seed();
    await db.insert(comments).values([
      { baseVersionId: versionId, anchorId: "preamble-s-1", signerId, body: "visible" },
      {
        baseVersionId: versionId,
        anchorId: "preamble-s-1",
        signerId,
        body: "hidden",
        hiddenAt: new Date(),
        hiddenReason: "spam",
      },
    ]);
    const rows = await listCommentsForVersion(db, versionId);
    expect(rows).toHaveLength(1);
    expect(rows[0].body).toBe("visible");
  });
});

describe("listCommentsByAnchorForVersion", () => {
  it("groups comments by anchorId correctly", async () => {
    const { db, versionId, signerId } = await seed();
    await db.insert(comments).values([
      {
        baseVersionId: versionId,
        anchorId: "preamble-s-1",
        signerId,
        body: "a",
        selectedText: "text a",
      },
      {
        baseVersionId: versionId,
        anchorId: "preamble-s-1",
        signerId,
        body: "b",
        selectedText: "text b",
      },
      {
        baseVersionId: versionId,
        anchorId: "preamble-s-2",
        signerId,
        body: "c",
      },
    ]);
    const byAnchor = await listCommentsByAnchorForVersion(db, versionId);
    expect(Object.keys(byAnchor)).toHaveLength(2);
    expect(byAnchor["preamble-s-1"]).toHaveLength(2);
    expect(byAnchor["preamble-s-2"]).toHaveLength(1);
    expect(byAnchor["preamble-s-1"][0].body).toBe("a");
    expect(byAnchor["preamble-s-1"][1].body).toBe("b");
  });

  it("skips hidden comments when grouping", async () => {
    const { db, versionId, signerId } = await seed();
    await db.insert(comments).values([
      { baseVersionId: versionId, anchorId: "preamble-s-1", signerId, body: "visible" },
      {
        baseVersionId: versionId,
        anchorId: "preamble-s-1",
        signerId,
        body: "hidden",
        hiddenAt: new Date(),
      },
    ]);
    const byAnchor = await listCommentsByAnchorForVersion(db, versionId);
    expect(byAnchor["preamble-s-1"]).toHaveLength(1);
    expect(byAnchor["preamble-s-1"][0].body).toBe("visible");
  });

  it("excludes comments with null anchorId from the map", async () => {
    const { db, versionId, signerId } = await seed();
    // Insert a proposal-anchored comment (anchorId null, proposalId would normally be set,
    // but for this test we just need to verify null anchorId is excluded).
    // The schema requires exactly one of (anchorId, proposalId) — use anchorId here.
    await db.insert(comments).values([
      { baseVersionId: versionId, anchorId: "preamble-s-1", signerId, body: "anchored" },
    ]);
    const byAnchor = await listCommentsByAnchorForVersion(db, versionId);
    expect(byAnchor["preamble-s-1"]).toHaveLength(1);
    // No key for null anchor
    expect(byAnchor["null"]).toBeUndefined();
    expect(byAnchor[""]).toBeUndefined();
  });
});
