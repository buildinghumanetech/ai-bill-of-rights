import { describe, expect, it } from "vitest";
import { createTestDb } from "../_helpers/pglite-db";
import { syncVersions } from "@/lib/db/sync";
import { comments, signers, versions } from "@/lib/db/schema";
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

describe("createComment (data layer)", () => {
  it("inserts a comment row anchored to a sentence", async () => {
    const { db, versionId, signerId } = await seed();
    const c = await createComment(db, {
      baseVersionId: versionId,
      signerId,
      anchorId: "preamble-s-1",
      body: "  hello world  ",
    });
    expect(c.id).toBeDefined();
    const rows = await db.select().from(comments);
    expect(rows).toHaveLength(1);
    expect(rows[0].body).toBe("hello world"); // trimmed
  });

  it("persists selectedText when provided", async () => {
    const { db, versionId, signerId } = await seed();
    await createComment(db, {
      baseVersionId: versionId,
      signerId,
      anchorId: "preamble-s-1",
      body: "nice quote",
      selectedText: "some highlighted text",
    });
    const rows = await db.select().from(comments);
    expect(rows[0].selectedText).toBe("some highlighted text");
  });

  it("stores null selectedText when not provided", async () => {
    const { db, versionId, signerId } = await seed();
    await createComment(db, {
      baseVersionId: versionId,
      signerId,
      anchorId: "preamble-s-1",
      body: "no selection",
    });
    const rows = await db.select().from(comments);
    expect(rows[0].selectedText).toBeNull();
  });

  it("rejects empty bodies", async () => {
    const { db, versionId, signerId } = await seed();
    await expect(
      createComment(db, {
        baseVersionId: versionId,
        signerId,
        anchorId: "preamble-s-1",
        body: "   ",
      }),
    ).rejects.toThrow(/empty/i);
  });

  it("requires exactly one of anchorId or proposalId", async () => {
    const { db, versionId, signerId } = await seed();
    await expect(
      createComment(db, {
        baseVersionId: versionId,
        signerId,
        body: "x",
      } as any),
    ).rejects.toThrow(/anchor.*or.*proposal/i);
  });
});
