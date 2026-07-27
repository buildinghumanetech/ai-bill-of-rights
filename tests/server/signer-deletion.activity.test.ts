/**
 * Deleting a signer who has ANY activity, not just referrals.
 *
 * `signers.referred_by_signer_id` is the only foreign key into `signers.id`
 * that carries an ON DELETE action. The other ~14 are bare `.references()`,
 * i.e. NO ACTION, so `deleteSigner` has to clear each one by hand — the
 * neon-http driver has no transactions, so it is one ordered statement at a
 * time with no rollback if the order is wrong.
 *
 * Before this suite, the cascade covered selfies, selfie_reports, the legacy
 * Phase 3 tables, signatures and consent_records — and nothing else. Anyone
 * who had endorsed a version, voted on a comment, flagged a comment, been
 * @-mentioned, upvoted a proposal or proposed an edit hit SQLSTATE 23503 on
 * the final `DELETE FROM signers`, on all three deletion paths. That is a
 * GDPR-erasure failure aimed squarely at the most engaged signers.
 *
 * Every case here seeds ONE kind of activity, deletes, and asserts two
 * things: the delete succeeded, and a bystander's data is still intact and
 * unmangled. Deletion that takes other people's content with it is a
 * different bug with the same root cause.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import Module from "node:module";
import { createTestDb, type TestDb } from "../_helpers/pglite-db";
import {
  attestations,
  commentMentions,
  commentReports,
  commentUpvotes,
  commentVotes,
  comments,
  endorsements,
  proposalUpvotes,
  proposedEdits,
  selfieReports,
  selfies,
  signers,
  versions,
} from "@/lib/db/schema";
import { createInMemoryBackend } from "@/lib/storage/blob";

/** Shared with the hoisted mock factories below; reassigned per test. */
const state = vi.hoisted(() => ({
  db: null as unknown,
  clerkUserId: null as string | null,
}));

const loader = Module as unknown as {
  _load(request: string, parent: unknown, isMain: boolean): unknown;
};
const originalLoad = loader._load;

/**
 * `me.ts` and `admin.ts` reach the Neon client through a CommonJS
 * `require("@/lib/db")` (deliberately, to keep the client from being built at
 * import time), and CJS resolution knows nothing about Vite's `@` alias or
 * Vitest's module registry — `vi.mock` alone leaves it throwing
 * MODULE_NOT_FOUND. Patching `Module._load` is the one hook that sits under
 * `require`.
 *
 * Installed in beforeAll, not at import time, so its lifetime is a symmetric
 * hook pair: if this file throws during collection the patch is never
 * installed, rather than being installed with no afterAll to undo it and
 * handing every later suite in this worker a stale pglite.
 */
beforeAll(() => {
  loader._load = function (this: unknown, request, ...rest) {
    if (request === "@/lib/db") return { db: state.db };
    return originalLoad.call(this, request, ...rest);
  } as typeof originalLoad;
});
afterAll(() => {
  loader._load = originalLoad;
});

vi.mock("@/lib/db", () => ({
  get db() {
    return state.db;
  },
}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: state.clerkUserId }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/admin/check", () => ({
  getCurrentAdmin: async () => ({
    state: "admin",
    signer: {
      id: "00000000-0000-4000-8000-00000000adm1",
      clerkUserId: "user_admin",
      displayName: "Admin",
      isAdmin: true,
    },
  }),
}));

let db: TestDb;
let versionId: string;
/** The signer being erased. */
let doomedId: string;
/** A bystander whose content must survive intact. */
let otherId: string;

beforeEach(async () => {
  // Fresh module registry per test so each action module's cached `_db`
  // points at this test's database rather than the previous test's.
  vi.resetModules();
  db = await createTestDb();
  state.db = db;
  state.clerkUserId = null;

  const [v] = await db
    .insert(versions)
    .values({
      version: "1.0.0",
      publishedAt: new Date(),
      markdownHash: "a".repeat(64),
      agentsMdHash: "b".repeat(64),
      specJsonHash: "c".repeat(64),
      parsedJson: {},
      isCurrent: true,
    })
    .returning({ id: versions.id });
  versionId = v.id as string;
  doomedId = await seedSigner("user_doomed", "Doomed Signer");
  otherId = await seedSigner("user_other", "Other Signer");
});

async function seedSigner(clerkUserId: string, displayName: string) {
  const [row] = await db
    .insert(signers)
    .values({
      clerkUserId,
      displayName,
      verificationMethod: "email",
      verifiedAt: new Date(),
    })
    .returning({ id: signers.id });
  return row.id as string;
}

async function seedComment(signerId: string, body: string, extra: Record<string, unknown> = {}) {
  const [row] = await db
    .insert(comments)
    .values({
      baseVersionId: versionId,
      anchorId: "preamble-s-1",
      signerId,
      body,
      ...extra,
    })
    .returning({ id: comments.id });
  return row.id as string;
}

async function seedProposal(proposerSignerId: string, extra: Record<string, unknown> = {}) {
  const [row] = await db
    .insert(proposedEdits)
    .values({
      baseVersionId: versionId,
      proposerSignerId,
      kind: "replace",
      targetAnchorId: "preamble-s-1",
      newText: "better words",
      ...extra,
    })
    .returning({ id: proposedEdits.id });
  return row.id as string;
}

/** Import fresh against this test's database. */
async function importDeleteSigner() {
  const { deleteSigner } = await import("@/server/signers/delete");
  return deleteSigner;
}

/** The signer is gone; the bystander is still a whole row, not a husk. */
async function expectDoomedGoneAndOtherIntact() {
  const gone = await db.select().from(signers).where(eq(signers.id, doomedId));
  expect(gone).toHaveLength(0);
  const [other] = await db.select().from(signers).where(eq(signers.id, otherId));
  expect(other).toBeDefined();
  expect(other.displayName).toBe("Other Signer");
}

describe("deleting a signer with activity", () => {
  it("succeeds when they endorsed a version", async () => {
    await db.insert(endorsements).values([
      { signerId: doomedId, baseVersionId: versionId },
      { signerId: otherId, baseVersionId: versionId },
    ]);
    const deleteSigner = await importDeleteSigner();

    await expect(deleteSigner(db, doomedId)).resolves.toBeUndefined();

    await expectDoomedGoneAndOtherIntact();
    const left = await db.select().from(endorsements);
    expect(left).toHaveLength(1);
    expect(left[0].signerId).toBe(otherId);
  });

  it("succeeds when they commented and votes exist in both directions", async () => {
    const doomedComment = await seedComment(doomedId, "mine");
    const otherComment = await seedComment(otherId, "theirs");
    await db.insert(commentVotes).values([
      // Someone else voted on the doomed signer's comment...
      { commentId: doomedComment, signerId: otherId, direction: 1 },
      // ...and the doomed signer voted on someone else's.
      { commentId: otherComment, signerId: doomedId, direction: -1 },
    ]);
    const deleteSigner = await importDeleteSigner();

    await expect(deleteSigner(db, doomedId)).resolves.toBeUndefined();

    await expectDoomedGoneAndOtherIntact();
    // Both votes are gone: one hung off a deleted comment, one was cast by
    // the deleted signer. The bystander's comment itself stays.
    expect(await db.select().from(commentVotes)).toHaveLength(0);
    const left = await db.select().from(comments);
    expect(left).toHaveLength(1);
    expect(left[0].id).toBe(otherComment);
    expect(left[0].body).toBe("theirs");
  });

  it("succeeds when legacy comment_upvotes rows point at them", async () => {
    const doomedComment = await seedComment(doomedId, "mine");
    const otherComment = await seedComment(otherId, "theirs");
    await db.insert(commentUpvotes).values([
      { commentId: doomedComment, signerId: otherId },
      { commentId: otherComment, signerId: doomedId },
    ]);
    const deleteSigner = await importDeleteSigner();

    await expect(deleteSigner(db, doomedId)).resolves.toBeUndefined();

    await expectDoomedGoneAndOtherIntact();
    expect(await db.select().from(commentUpvotes)).toHaveLength(0);
  });

  it("succeeds when comment reports point at them as reporter", async () => {
    const doomedComment = await seedComment(doomedId, "mine");
    const otherComment = await seedComment(otherId, "theirs");
    await db.insert(commentReports).values([
      { commentId: otherComment, reporterSignerId: doomedId },
      { commentId: doomedComment, reporterSignerId: otherId },
    ]);
    const deleteSigner = await importDeleteSigner();

    await expect(deleteSigner(db, doomedId)).resolves.toBeUndefined();

    await expectDoomedGoneAndOtherIntact();
    expect(await db.select().from(commentReports)).toHaveLength(0);
    expect(await db.select().from(comments)).toHaveLength(1);
  });

  it("keeps a report they moderated and only forgets who moderated it", async () => {
    // The nullable-moderation-column rule: erasing a moderator must not erase
    // the flag a third party raised, nor the fact that it was resolved.
    const thirdId = await seedSigner("user_third", "Third Signer");
    const thirdComment = await seedComment(thirdId, "flagged");
    const resolvedAt = new Date("2026-06-01T12:00:00Z");
    await db.insert(commentReports).values({
      commentId: thirdComment,
      reporterSignerId: otherId,
      resolvedAt,
      resolvedBy: doomedId,
    });
    const deleteSigner = await importDeleteSigner();

    await expect(deleteSigner(db, doomedId)).resolves.toBeUndefined();

    const [report] = await db.select().from(commentReports);
    expect(report).toBeDefined();
    expect(report.reporterSignerId).toBe(otherId);
    expect(report.resolvedBy).toBeNull();
    expect(report.resolvedAt?.getTime()).toBe(resolvedAt.getTime());
  });

  it("succeeds when they were @-mentioned in someone else's comment", async () => {
    const otherComment = await seedComment(otherId, "hey @doomed");
    const doomedComment = await seedComment(doomedId, "hey @other");
    await db.insert(commentMentions).values([
      { commentId: otherComment, mentionedSignerId: doomedId },
      { commentId: doomedComment, mentionedSignerId: otherId },
    ]);
    const deleteSigner = await importDeleteSigner();

    await expect(deleteSigner(db, doomedId)).resolves.toBeUndefined();

    await expectDoomedGoneAndOtherIntact();
    // The mention OF the doomed signer goes; the comment carrying it stays.
    expect(await db.select().from(commentMentions)).toHaveLength(0);
    const left = await db.select().from(comments);
    expect(left).toHaveLength(1);
    expect(left[0].body).toBe("hey @doomed");
  });

  it("succeeds when they upvoted a proposal", async () => {
    const otherProposal = await seedProposal(otherId);
    await db
      .insert(proposalUpvotes)
      .values({ proposalId: otherProposal, signerId: doomedId });
    const deleteSigner = await importDeleteSigner();

    await expect(deleteSigner(db, doomedId)).resolves.toBeUndefined();

    await expectDoomedGoneAndOtherIntact();
    expect(await db.select().from(proposalUpvotes)).toHaveLength(0);
    const left = await db.select().from(proposedEdits);
    expect(left).toHaveLength(1);
    expect(left[0].id).toBe(otherProposal);
    expect(left[0].proposerSignerId).toBe(otherId);
  });

  it("succeeds when they proposed an edit that others upvoted", async () => {
    const doomedProposal = await seedProposal(doomedId);
    const otherProposal = await seedProposal(otherId);
    await db.insert(proposalUpvotes).values([
      { proposalId: doomedProposal, signerId: otherId },
      { proposalId: otherProposal, signerId: otherId },
    ]);
    const deleteSigner = await importDeleteSigner();

    await expect(deleteSigner(db, doomedId)).resolves.toBeUndefined();

    await expectDoomedGoneAndOtherIntact();
    const left = await db.select().from(proposedEdits);
    expect(left).toHaveLength(1);
    expect(left[0].id).toBe(otherProposal);
    // Only the upvote on the erased proposal went with it.
    const upvotes = await db.select().from(proposalUpvotes);
    expect(upvotes).toHaveLength(1);
    expect(upvotes[0].proposalId).toBe(otherProposal);
  });

  it("keeps a proposal they decided on and only forgets who decided", async () => {
    const decidedAt = new Date("2026-06-02T09:30:00Z");
    const otherProposal = await seedProposal(otherId, {
      status: "accepted",
      decidedAt,
      decidedBy: doomedId,
    });
    const deleteSigner = await importDeleteSigner();

    await expect(deleteSigner(db, doomedId)).resolves.toBeUndefined();

    const [proposal] = await db
      .select()
      .from(proposedEdits)
      .where(eq(proposedEdits.id, otherProposal));
    expect(proposal).toBeDefined();
    expect(proposal.proposerSignerId).toBe(otherId);
    expect(proposal.decidedBy).toBeNull();
    // The ruling itself is the community's history, not the moderator's.
    expect(proposal.status).toBe("accepted");
    expect(proposal.decidedAt?.getTime()).toBe(decidedAt.getTime());
  });

  it("takes the discussion thread on their proposal with the proposal", async () => {
    // proposer_signer_id is NOT NULL, so the proposal cannot outlive them, and
    // comments.proposal_id would then dangle. Comments elsewhere are untouched.
    const doomedProposal = await seedProposal(doomedId);
    await seedComment(otherId, "on their proposal", {
      anchorId: null,
      proposalId: doomedProposal,
    });
    const keptComment = await seedComment(otherId, "on the document");
    const deleteSigner = await importDeleteSigner();

    await expect(deleteSigner(db, doomedId)).resolves.toBeUndefined();

    await expectDoomedGoneAndOtherIntact();
    expect(await db.select().from(proposedEdits)).toHaveLength(0);
    const left = await db.select().from(comments);
    expect(left).toHaveLength(1);
    expect(left[0].id).toBe(keptComment);
  });

  it("detaches other people's replies instead of deleting them", async () => {
    const doomedComment = await seedComment(doomedId, "mine");
    const reply = await seedComment(otherId, "I disagree", {
      parentCommentId: doomedComment,
    });
    const deleteSigner = await importDeleteSigner();

    await expect(deleteSigner(db, doomedId)).resolves.toBeUndefined();

    const left = await db.select().from(comments);
    expect(left).toHaveLength(1);
    expect(left[0].id).toBe(reply);
    expect(left[0].body).toBe("I disagree");
    // buildTree() already promotes a parentless reply to a root.
    expect(left[0].parentCommentId).toBeNull();
  });

  it("succeeds when their own comment is itself a reply to their own comment", async () => {
    // Parent and child both doomed: they go in one statement, and Postgres
    // fires RI triggers after the statement, so ordering inside it is moot.
    const root = await seedComment(doomedId, "root");
    await seedComment(doomedId, "self-reply", { parentCommentId: root });
    const deleteSigner = await importDeleteSigner();

    await expect(deleteSigner(db, doomedId)).resolves.toBeUndefined();

    expect(await db.select().from(comments)).toHaveLength(0);
  });

  it("forgets that they reviewed someone else's selfie", async () => {
    const [otherSelfie] = await db
      .insert(selfies)
      .values({
        signerId: otherId,
        status: "approved",
        originalBlobUrl: "mem://o",
        displayBlobUrl: "mem://d",
        thumbnailBlobUrl: "mem://t",
        originalMime: "image/jpeg",
        originalBytes: 10,
        captureMethod: "upload",
        reviewedAt: new Date(),
        reviewedBy: doomedId,
      })
      .returning({ id: selfies.id });
    await db.insert(selfieReports).values({
      selfieId: otherSelfie.id,
      reporterSignerId: otherId,
      resolvedAt: new Date(),
      resolvedBy: doomedId,
      resolution: "allowed",
    });
    const deleteSigner = await importDeleteSigner();

    await expect(
      deleteSigner(db, doomedId, createInMemoryBackend()),
    ).resolves.toBeUndefined();

    const [selfie] = await db.select().from(selfies);
    expect(selfie.signerId).toBe(otherId);
    expect(selfie.reviewedBy).toBeNull();
    const [report] = await db.select().from(selfieReports);
    expect(report.reporterSignerId).toBe(otherId);
    expect(report.resolvedBy).toBeNull();
  });

  it("leaves attestations alone — they belong to an org, not a signer", async () => {
    // `attestations` has no FK to signers.id in schema.ts, the migrations or
    // the test DDL: a product attestation is claimed by an email address, not
    // by a signer. It must therefore survive any signer deletion untouched.
    await db.insert(attestations).values({
      orgName: "Acme",
      productName: "Widget",
      versionId,
      contactEmail: "who@example.com",
      verificationToken: "tok_1",
      published: true,
    });
    await db.insert(endorsements).values({ signerId: doomedId, baseVersionId: versionId });
    const deleteSigner = await importDeleteSigner();

    await expect(deleteSigner(db, doomedId)).resolves.toBeUndefined();

    const [attestation] = await db.select().from(attestations);
    expect(attestation).toBeDefined();
    expect(attestation.orgName).toBe("Acme");
    expect(attestation.published).toBe(true);
  });
});

/**
 * A signer wired into every table at once, deleted through each of the three
 * paths. This is the shape of a real engaged account, and the case that was
 * failing in production.
 */
async function seedBusySigner() {
  const doomedComment = await seedComment(doomedId, "my comment");
  const otherComment = await seedComment(otherId, "their comment");
  const doomedProposal = await seedProposal(doomedId);
  const otherProposal = await seedProposal(otherId, {
    status: "rejected",
    decidedAt: new Date("2026-06-03T00:00:00Z"),
    decidedBy: doomedId,
  });
  await db.insert(endorsements).values({ signerId: doomedId, baseVersionId: versionId });
  await db.insert(commentVotes).values([
    { commentId: otherComment, signerId: doomedId, direction: 1 },
    { commentId: doomedComment, signerId: otherId, direction: 1 },
  ]);
  await db.insert(commentUpvotes).values({ commentId: otherComment, signerId: doomedId });
  await db.insert(commentReports).values({
    commentId: otherComment,
    reporterSignerId: doomedId,
  });
  await db.insert(commentMentions).values([
    { commentId: otherComment, mentionedSignerId: doomedId },
    { commentId: doomedComment, mentionedSignerId: otherId },
  ]);
  await db.insert(proposalUpvotes).values([
    { proposalId: otherProposal, signerId: doomedId },
    { proposalId: doomedProposal, signerId: otherId },
  ]);
  await seedComment(otherId, "reply to mine", { parentCommentId: doomedComment });
  return { otherComment, otherProposal };
}

/** Whatever path ran, the bystander keeps their comment and their proposal. */
async function expectBystanderSurvived(otherComment: string, otherProposal: string) {
  await expectDoomedGoneAndOtherIntact();
  const [comment] = await db
    .select()
    .from(comments)
    .where(eq(comments.id, otherComment));
  expect(comment).toBeDefined();
  expect(comment.body).toBe("their comment");
  const [proposal] = await db
    .select()
    .from(proposedEdits)
    .where(eq(proposedEdits.id, otherProposal));
  expect(proposal).toBeDefined();
  expect(proposal.status).toBe("rejected");
  expect(proposal.decidedBy).toBeNull();
}

describe("deleting a signer with activity in every table", () => {
  it("succeeds via the revoke path (deleteSigner)", async () => {
    const { otherComment, otherProposal } = await seedBusySigner();
    const deleteSigner = await importDeleteSigner();

    await expect(deleteSigner(db, doomedId)).resolves.toBeUndefined();

    await expectBystanderSurvived(otherComment, otherProposal);
  });

  it("succeeds via the self-service path (removeMySignature)", async () => {
    const { otherComment, otherProposal } = await seedBusySigner();
    state.clerkUserId = "user_doomed";
    const { removeMySignature } = await import("@/server/actions/me");

    await expect(removeMySignature()).resolves.toEqual({ success: true });

    await expectBystanderSurvived(otherComment, otherProposal);
  });

  it("succeeds via the admin path (deleteSignerAction)", async () => {
    const { otherComment, otherProposal } = await seedBusySigner();
    state.clerkUserId = "user_admin";
    const { deleteSignerAction } = await import("@/server/actions/admin");

    await expect(deleteSignerAction(doomedId)).resolves.toBeUndefined();

    await expectBystanderSurvived(otherComment, otherProposal);
  });
});
