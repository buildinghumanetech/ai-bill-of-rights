import { describe, expect, it } from "vitest";
import { createTestDb } from "../_helpers/pglite-db";
import { comments, proposalUpvotes, proposedEdits, signers, versions } from "@/lib/db/schema";
import { syncVersions } from "@/lib/db/sync";
import {
  createNewArticleProposal,
  decideProposal,
  hideProposal,
  renderProposalAsMarkdown,
  toggleProposalUpvote,
  unhideProposal,
  ARTICLE_NUMBER_PLACEHOLDER,
} from "@/server/proposals/core";
import { listProposedRights } from "@/lib/db/proposal-queries";
import { validateNewArticle } from "@/lib/proposals/validate";

const sampleMarkdown = `---
version: 1.0.0
published_at: 2026-05-18
---

# T {#preamble}
x {#preamble-s-1}
`;

const GOOD = {
  title: "Your Mind Is Not a Customer",
  body:
    "No AI system may present uncertain knowledge with false confidence, or substitute fluent answers for the work of understanding. Where a person is trying to learn, the system must show its uncertainty and support the effort rather than replace it.",
  rationale:
    "Article 4 covers the system acting against you and Article 9 covers your attention. Neither covers a system that serves you so smoothly you stop developing judgment.",
  pullQuote: "Fluency is not understanding.",
};

async function seed() {
  const db = await createTestDb();
  await syncVersions(db, [
    {
      version: "1.0.0",
      publishedAt: new Date("2026-05-18T00:00:00Z"),
      markdown: sampleMarkdown,
      agentsMd: "stub",
      specJson: "{}",
      isCurrent: true,
      gitCommitSha: null,
    },
  ]);
  const [v] = await db.select().from(versions);
  const mk = async (clerkUserId: string, displayName: string) => {
    const [s] = await db
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
    return s.id as string;
  };
  return {
    db,
    versionId: v.id as string,
    alice: await mk("u1", "Alice"),
    bob: await mk("u2", "Bob"),
    admin: await mk("u3", "Admin"),
  };
}

describe("new-article proposals", () => {
  it("stores a proposal and auto-endorses it for the proposer", async () => {
    const { db, versionId, alice } = await seed();
    const res = await createNewArticleProposal(db, {
      baseVersionId: versionId,
      proposerSignerId: alice,
      ...GOOD,
    });
    expect(res.ok).toBe(true);

    const [row] = await db.select().from(proposedEdits);
    expect(row.kind).toBe("new_article");
    expect(row.targetAnchorId).toBe("document-end");
    expect(row.status).toBe("pending");
    expect(row.title).toBe(GOOD.title);

    const votes = await db.select().from(proposalUpvotes);
    expect(votes).toHaveLength(1);
    expect(votes[0].signerId).toBe(alice);
  });

  it("rejects a proposer-supplied article number", () => {
    const check = validateNewArticle({ ...GOOD, title: "Article 12: Something" });
    expect(check.ok).toBe(false);
    expect(check.errors.title).toMatch(/number/i);
  });

  it("rejects a body too short to be a right", async () => {
    const { db, versionId, alice } = await seed();
    const res = await createNewArticleProposal(db, {
      baseVersionId: versionId,
      proposerSignerId: alice,
      ...GOOD,
      body: "AI should be nice.",
    });
    expect(res).toMatchObject({ ok: false, field: "body" });
    expect(await db.select().from(proposedEdits)).toHaveLength(0);
  });

  it("validates AFTER sanitising, so control characters can't pad a short body", async () => {
    const { db, versionId, alice } = await seed();
    const res = await createNewArticleProposal(db, {
      baseVersionId: versionId,
      proposerSignerId: alice,
      ...GOOD,
      body: "Too short." + "\x07".repeat(200),
    });
    expect(res).toMatchObject({ ok: false, field: "body" });
  });

  it("counts one endorsement per signer and toggles cleanly", async () => {
    const { db, versionId, alice, bob } = await seed();
    const res = await createNewArticleProposal(db, {
      baseVersionId: versionId,
      proposerSignerId: alice,
      ...GOOD,
    });
    const id = (res as { id: string }).id;

    expect(await toggleProposalUpvote(db, { proposalId: id, signerId: bob })).toEqual({
      state: "upvoted",
    });
    // Same signer again is a removal, not a second vote.
    expect(await toggleProposalUpvote(db, { proposalId: id, signerId: bob })).toEqual({
      state: "removed",
    });
    expect(await db.select().from(proposalUpvotes)).toHaveLength(1);
  });

  it("lists proposals with accurate, non-multiplied counts", async () => {
    const { db, versionId, alice, bob } = await seed();
    const res = await createNewArticleProposal(db, {
      baseVersionId: versionId,
      proposerSignerId: alice,
      ...GOOD,
    });
    const id = (res as { id: string }).id;
    await toggleProposalUpvote(db, { proposalId: id, signerId: bob });

    // Two comments and two upvotes: a naive double join would report 4 of each.
    await db.insert(comments).values([
      { baseVersionId: versionId, proposalId: id, signerId: bob, body: "one" },
      { baseVersionId: versionId, proposalId: id, signerId: alice, body: "two" },
    ]);

    const [p] = await listProposedRights(db, {
      baseVersionId: versionId,
      viewerSignerId: bob,
    });
    expect(p.upvoteCount).toBe(2);
    expect(p.commentCount).toBe(2);
    expect(p.viewerHasUpvoted).toBe(true);
    expect(p.proposerDisplayName).toBe("Alice");
  });

  it("excludes hidden proposals from the public queue but not the admin one", async () => {
    const { db, versionId, alice, admin } = await seed();
    const res = await createNewArticleProposal(db, {
      baseVersionId: versionId,
      proposerSignerId: alice,
      ...GOOD,
    });
    const id = (res as { id: string }).id;

    await hideProposal(db, id, admin, true, "admin_hidden");
    expect(await listProposedRights(db, { baseVersionId: versionId })).toHaveLength(0);
    expect(
      await listProposedRights(db, { baseVersionId: versionId, includeHidden: true }),
    ).toHaveLength(1);

    await unhideProposal(db, id, true);
    expect(await listProposedRights(db, { baseVersionId: versionId })).toHaveLength(1);
  });

  it("lets the author withdraw but not a stranger", async () => {
    const { db, versionId, alice, bob } = await seed();
    const res = await createNewArticleProposal(db, {
      baseVersionId: versionId,
      proposerSignerId: alice,
      ...GOOD,
    });
    const id = (res as { id: string }).id;

    expect(await hideProposal(db, id, bob, false)).toMatchObject({ ok: false });
    expect(await hideProposal(db, id, alice, false)).toMatchObject({ ok: true });
  });

  it("refuses a decision from a non-admin", async () => {
    const { db, versionId, alice, bob } = await seed();
    const res = await createNewArticleProposal(db, {
      baseVersionId: versionId,
      proposerSignerId: alice,
      ...GOOD,
    });
    const id = (res as { id: string }).id;
    expect(await decideProposal(db, id, "accepted", bob, false)).toMatchObject({
      ok: false,
    });
    expect(await decideProposal(db, id, "accepted", bob, true)).toMatchObject({
      ok: true,
    });
    const [row] = await db.select().from(proposedEdits);
    expect(row.status).toBe("accepted");
    expect(row.decidedBy).toBe(bob);
  });

  it("renders accepted markdown with sequential sentence anchors", () => {
    const md = renderProposalAsMarkdown(
      { title: "A Title", newText: "First sentence. Second sentence.", pullQuote: "Closing." },
      12,
    );
    expect(md).toContain("## Article 12: A Title {#article-12}");
    expect(md).toContain("First sentence. {#article-12-s-1}");
    expect(md).toContain("Second sentence. {#article-12-s-2}");
    expect(md).toContain("Closing. {#article-12-s-3}");
  });

  /**
   * The admin preview on /admin/proposals used to inline its own copy of this
   * split-and-anchor logic, so the block an admin copied could drift from the
   * block publishing emits. It now calls this renderer with the placeholder;
   * these lock in the contract that made that collapse possible.
   */
  it("accepts the placeholder slot for a proposal with no number yet", () => {
    const md = renderProposalAsMarkdown(
      { title: "A Title", newText: "First sentence. Second sentence.", pullQuote: "Closing." },
      ARTICLE_NUMBER_PLACEHOLDER,
    );
    expect(md).toContain("## Article N: A Title {#article-N}");
    expect(md).toContain("First sentence. {#article-N-s-1}");
    expect(md).toContain("Second sentence. {#article-N-s-2}");
    expect(md).toContain("Closing. {#article-N-s-3}");
  });

  it("numbers the placeholder render exactly as a numbered one", () => {
    const proposal = {
      title: "A Title",
      newText: "First sentence. Second sentence.",
      pullQuote: "Closing.",
    };
    expect(
      renderProposalAsMarkdown(proposal, ARTICLE_NUMBER_PLACEHOLDER).replace(/\bN\b/g, "12"),
    ).toBe(renderProposalAsMarkdown(proposal, 12));
  });
});
