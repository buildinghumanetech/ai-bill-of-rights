import { describe, expect, it } from "vitest";
import { createTestDb } from "../_helpers/pglite-db";
import { syncVersions } from "@/lib/db/sync";
import { comments, signers, versions } from "@/lib/db/schema";
import { createComment, editComment, deleteComment } from "@/server/actions/comments";
import { eq } from "drizzle-orm";

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

describe("editComment (data layer)", () => {
  it("author can edit their own comment", async () => {
    const { db, versionId, signerId } = await seed();
    const { id: commentId } = await createComment(db, {
      baseVersionId: versionId,
      signerId,
      anchorId: "preamble-s-1",
      body: "original body",
    });

    const res = await editComment(db, commentId, "updated body", signerId, false);
    expect(res.ok).toBe(true);

    const rows = await db.select().from(comments).where(eq(comments.id, commentId));
    expect(rows[0].body).toBe("updated body");
  });

  it("admin can edit anyone's comment", async () => {
    const { db, versionId, signerId } = await seed();

    const [admin] = await db
      .insert(signers)
      .values({
        clerkUserId: "admin1",
        displayName: "Admin",
        affiliation: null,
        locationText: null,
        verificationMethod: "email",
        verifiedAt: new Date(),
        isAdmin: true,
      })
      .returning({ id: signers.id });

    const { id: commentId } = await createComment(db, {
      baseVersionId: versionId,
      signerId, // owned by u1
      anchorId: "preamble-s-1",
      body: "original",
    });

    const res = await editComment(db, commentId, "admin edited", admin.id, true);
    expect(res.ok).toBe(true);

    const rows = await db.select().from(comments).where(eq(comments.id, commentId));
    expect(rows[0].body).toBe("admin edited");
  });

  it("non-author non-admin cannot edit", async () => {
    const { db, versionId, signerId } = await seed();

    const [other] = await db
      .insert(signers)
      .values({
        clerkUserId: "u2",
        displayName: "Other",
        affiliation: null,
        locationText: null,
        verificationMethod: "email",
        verifiedAt: new Date(),
      })
      .returning({ id: signers.id });

    const { id: commentId } = await createComment(db, {
      baseVersionId: versionId,
      signerId,
      anchorId: "preamble-s-1",
      body: "original",
    });

    const res = await editComment(db, commentId, "hacked", other.id, false);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/not authorized/i);
  });

  it("rejects empty body on edit", async () => {
    const { db, versionId, signerId } = await seed();
    const { id: commentId } = await createComment(db, {
      baseVersionId: versionId,
      signerId,
      anchorId: "preamble-s-1",
      body: "original",
    });
    const res = await editComment(db, commentId, "   ", signerId, false);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/empty/i);
  });
});

describe("deleteComment (data layer)", () => {
  it("author can delete their own comment with user_delete reason", async () => {
    const { db, versionId, signerId } = await seed();
    const { id: commentId } = await createComment(db, {
      baseVersionId: versionId,
      signerId,
      anchorId: "preamble-s-1",
      body: "to be deleted",
    });

    const res = await deleteComment(db, commentId, signerId, false);
    expect(res.ok).toBe(true);

    const rows = await db.select().from(comments).where(eq(comments.id, commentId));
    expect(rows[0].hiddenAt).not.toBeNull();
    expect(rows[0].hiddenReason).toBe("user_delete");
  });

  it("admin can delete anyone's comment with admin_delete reason", async () => {
    const { db, versionId, signerId } = await seed();
    const [admin] = await db
      .insert(signers)
      .values({
        clerkUserId: "admin1",
        displayName: "Admin",
        affiliation: null,
        locationText: null,
        verificationMethod: "email",
        verifiedAt: new Date(),
        isAdmin: true,
      })
      .returning({ id: signers.id });

    const { id: commentId } = await createComment(db, {
      baseVersionId: versionId,
      signerId, // owned by u1
      anchorId: "preamble-s-1",
      body: "someone else comment",
    });

    const res = await deleteComment(db, commentId, admin.id, true);
    expect(res.ok).toBe(true);

    const rows = await db.select().from(comments).where(eq(comments.id, commentId));
    expect(rows[0].hiddenReason).toBe("admin_delete");
  });

  it("non-author non-admin cannot delete", async () => {
    const { db, versionId, signerId } = await seed();
    const [other] = await db
      .insert(signers)
      .values({
        clerkUserId: "u2",
        displayName: "Other",
        affiliation: null,
        locationText: null,
        verificationMethod: "email",
        verifiedAt: new Date(),
      })
      .returning({ id: signers.id });

    const { id: commentId } = await createComment(db, {
      baseVersionId: versionId,
      signerId,
      anchorId: "preamble-s-1",
      body: "protected",
    });

    const res = await deleteComment(db, commentId, other.id, false);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/not authorized/i);
  });

  it("admin deleting own comment uses user_delete reason", async () => {
    const { db, versionId } = await seed();
    const [admin] = await db
      .insert(signers)
      .values({
        clerkUserId: "admin1",
        displayName: "Admin",
        affiliation: null,
        locationText: null,
        verificationMethod: "email",
        verifiedAt: new Date(),
        isAdmin: true,
      })
      .returning({ id: signers.id });

    const { id: commentId } = await createComment(db, {
      baseVersionId: (await db.select().from(versions))[0].id,
      signerId: admin.id,
      anchorId: "preamble-s-1",
      body: "admin's own comment",
    });

    const res = await deleteComment(db, commentId, admin.id, true);
    expect(res.ok).toBe(true);

    const rows = await db.select().from(comments).where(eq(comments.id, commentId));
    // isOwner=true, so user_delete even though callerIsAdmin=true
    expect(rows[0].hiddenReason).toBe("user_delete");
  });
});
