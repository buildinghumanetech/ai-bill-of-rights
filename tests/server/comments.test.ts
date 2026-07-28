import { describe, expect, it } from "vitest";
import { createTestDb } from "../_helpers/pglite-db";
import { syncVersions } from "@/lib/db/sync";
import { comments, signers, versions, commentMentions } from "@/lib/db/schema";
import { createComment, editComment, deleteComment } from "@/server/comments/core";
import { parseMentions } from "@/lib/comments/mentions";
import {
  appendResolvedMentions,
  readSubmittedMentions,
  resolveSubmittedMentions,
} from "@/lib/comments/resolved-mentions";
import { eq } from "drizzle-orm";

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

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

describe("comment mentions (data layer)", () => {
  it("parseMentions + insert mention rows when known signers are passed in", async () => {
    const { db, versionId, signerId } = await seed();

    // Create a second signer to be mentioned
    const [mentioned] = await db
      .insert(signers)
      .values({
        clerkUserId: "u_mentioned",
        displayName: "Alice",
        affiliation: null,
        locationText: null,
        verificationMethod: "email",
        verifiedAt: new Date(),
      })
      .returning({ id: signers.id });

    // Create a comment body that mentions Alice
    const body = "Hello @Alice, check this out!";
    const knownSigners = [{ id: mentioned.id, displayName: "Alice" }];
    const { id: commentId } = await createComment(db, {
      baseVersionId: versionId,
      signerId,
      anchorId: "preamble-s-1",
      body,
    });

    // Simulate what the action does: parse mentions, insert mention rows
    const mentions = parseMentions(body, knownSigners);
    expect(mentions).toHaveLength(1);
    expect(mentions[0].signerId).toBe(mentioned.id);

    // Insert mention row
    await db.insert(commentMentions).values({
      commentId,
      mentionedSignerId: mentions[0].signerId,
    });

    const mentionRows = await db.select().from(commentMentions).where(eq(commentMentions.commentId, commentId));
    expect(mentionRows).toHaveLength(1);
    expect(mentionRows[0].mentionedSignerId).toBe(mentioned.id);
  });

  it("does not duplicate mention rows on re-insert (unique constraint)", async () => {
    const { db, versionId, signerId } = await seed();

    const [mentioned] = await db
      .insert(signers)
      .values({
        clerkUserId: "u_bob",
        displayName: "Bob",
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
      body: "@Bob is great",
    });

    // Insert twice — second should be no-op via onConflictDoNothing
    await db.insert(commentMentions).values({ commentId, mentionedSignerId: mentioned.id });
    await db.insert(commentMentions).values({ commentId, mentionedSignerId: mentioned.id }).onConflictDoNothing();

    const rows = await db.select().from(commentMentions).where(eq(commentMentions.commentId, commentId));
    expect(rows).toHaveLength(1);
  });
});

describe("write-time mention resolution (data layer)", () => {
  /** Add a mentionable signer and return {id, displayName}. */
  async function addSigner(
    db: TestDb,
    clerkUserId: string,
    displayName: string,
  ) {
    const [row] = await db
      .insert(signers)
      .values({
        clerkUserId,
        displayName,
        affiliation: null,
        locationText: null,
        verificationMethod: "email",
        verifiedAt: new Date(),
      })
      .returning({ id: signers.id });
    return { id: row.id as string, displayName };
  }

  /**
   * Mirror of the notification block in `submitCommentAction`: resolve, drop
   * self-mentions, insert rows. Kept in the test rather than exercising the
   * action itself because that path needs Clerk and Resend; what matters here is
   * that the ids reaching `comment_mentions` come from the composer.
   */
  async function recordMentions(
    db: TestDb,
    commentId: string,
    body: string,
    submitted: string[],
    known: { id: string; displayName: string }[],
    authorSignerId: string,
  ) {
    const fd = new FormData();
    appendResolvedMentions(
      fd,
      submitted.map((id) => ({
        signerId: id,
        displayName: known.find((k) => k.id === id)?.displayName ?? "",
      })),
    );
    const read = readSubmittedMentions(fd);
    // No prose-parsing branch — this mirrors the action, which notifies nobody
    // when a submission carries no resolution.
    const mentions = read.fromComposer
      ? resolveSubmittedMentions(body, read.signerIds, known)
      : [];
    for (const m of mentions.filter((m) => m.signerId !== authorSignerId)) {
      await db
        .insert(commentMentions)
        .values({ commentId, mentionedSignerId: m.signerId })
        .onConflictDoNothing();
    }
    return db
      .select()
      .from(commentMentions)
      .where(eq(commentMentions.commentId, commentId));
  }

  it("notifies exactly the signer the composer resolved", async () => {
    const { db, versionId, signerId } = await seed();
    const alice = await addSigner(db, "u_alice_w", "Alice Nguyen");
    const erik = await addSigner(db, "u_erik_w", "Erik");
    const known = [alice, erik];

    const body = "thanks @Alice Nguyen for the review";
    const { id: commentId } = await createComment(db, {
      baseVersionId: versionId,
      signerId,
      anchorId: "preamble-s-1",
      body,
    });

    const rows = await recordMentions(db, commentId, body, [alice.id], known, signerId);
    expect(rows).toHaveLength(1);
    expect(rows[0].mentionedSignerId).toBe(alice.id);
  });

  it("notifies nobody for an email address, even if an id is submitted", async () => {
    // `bob!@alice.com` is the body that made the parse path email signer Alice.
    // Write-time resolution can't reach her: her name isn't in the comment.
    const { db, versionId, signerId } = await seed();
    const alice = await addSigner(db, "u_alice_e", "Alice Nguyen");

    const body = "write bob!@alice.com, then cc me";
    const { id: commentId } = await createComment(db, {
      baseVersionId: versionId,
      signerId,
      anchorId: "preamble-s-1",
      body,
    });

    const rows = await recordMentions(db, commentId, body, [alice.id], [alice], signerId);
    expect(rows).toEqual([]);
  });

  it("notifies nobody when the author typed the name without picking it", async () => {
    const { db, versionId, signerId } = await seed();
    const alice = await addSigner(db, "u_alice_t", "Alice Nguyen");

    const body = "thanks @Alice Nguyen";
    const { id: commentId } = await createComment(db, {
      baseVersionId: versionId,
      signerId,
      anchorId: "preamble-s-1",
      body,
    });

    // Composer resolved and found nothing — no ids submitted, marker still set.
    const rows = await recordMentions(db, commentId, body, [], [alice], signerId);
    expect(rows).toEqual([]);
  });

  it("notifies nobody when a submission carries no resolution", async () => {
    // No source marker (a hand-rolled POST). There is deliberately no prose
    // fallback: one the client selects by omitting a field would be an opt-out
    // from the containment guarantee, and `parseMentions` would notify Alice for
    // a body like `bob!@alice.com`.
    const { db, versionId, signerId } = await seed();
    const alice = await addSigner(db, "u_alice_f", "Alice");

    const body = "Hello @Alice, check this out!";
    const { id: commentId } = await createComment(db, {
      baseVersionId: versionId,
      signerId,
      anchorId: "preamble-s-1",
      body,
    });

    const read = readSubmittedMentions(new FormData());
    expect(read.fromComposer).toBe(false);
    // The prose still names Alice, and the old path would have found her.
    expect(parseMentions(body, [alice])).toHaveLength(1);

    const rows = await db
      .select()
      .from(commentMentions)
      .where(eq(commentMentions.commentId, commentId));
    expect(rows).toEqual([]);
  });

  it("drops a self-mention", async () => {
    const { db, versionId, signerId } = await seed();
    const [me] = await db
      .select({ id: signers.id, displayName: signers.displayName })
      .from(signers)
      .where(eq(signers.id, signerId));

    const body = `note to self @${me.displayName}`;
    const { id: commentId } = await createComment(db, {
      baseVersionId: versionId,
      signerId,
      anchorId: "preamble-s-1",
      body,
    });

    const rows = await recordMentions(db, commentId, body, [me.id], [me], signerId);
    expect(rows).toEqual([]);
  });
});
