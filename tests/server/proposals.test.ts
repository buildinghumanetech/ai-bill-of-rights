import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
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
import { validateNewArticle, BODY_MAX } from "@/lib/proposals/validate";
import { PROPOSAL_LICENSE } from "@/lib/proposals/license";

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
  license: PROPOSAL_LICENSE.id,
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

  /**
   * The GitHub mirror used to re-read `formData` instead of using what was
   * written, so a mirrored public issue could carry control characters and
   * over-length text that appear nowhere on the site. `stored` is the single
   * source the mirror now reads; these assert it really is what landed in the
   * row, which is the whole guarantee the mirror depends on.
   */
  it("returns the stored text, stripped and truncated, not the raw input", async () => {
    const { db, versionId, alice } = await seed();
    const res = await createNewArticleProposal(db, {
      baseVersionId: versionId,
      proposerSignerId: alice,
      ...GOOD,
      title: "A Title\x07 with a bell",
      rationale: GOOD.rationale + "\x00".repeat(10),
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.stored.title).toBe("A Title with a bell");
    expect(res.stored.title).not.toContain("\x07");
    expect(res.stored.rationale).not.toContain("\x00");
    expect(res.stored.body.length).toBeLessThanOrEqual(BODY_MAX);
  });

  it("truncates an over-length body in the stored text the mirror reads", async () => {
    const { db, versionId, alice } = await seed();
    const long = GOOD.body + " padding.".repeat(400);
    expect(long.length).toBeGreaterThan(BODY_MAX);

    const res = await createNewArticleProposal(db, {
      baseVersionId: versionId,
      proposerSignerId: alice,
      ...GOOD,
      body: long,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.stored.body.length).toBe(BODY_MAX);
    expect(res.stored.body).not.toBe(long);
  });

  it("stored text matches the persisted row exactly", async () => {
    const { db, versionId, alice } = await seed();
    const res = await createNewArticleProposal(db, {
      baseVersionId: versionId,
      proposerSignerId: alice,
      ...GOOD,
      title: "Bell\x07 Title",
      body: GOOD.body + "\x0B\x0B",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const [row] = await db
      .select({
        title: proposedEdits.title,
        newText: proposedEdits.newText,
        rationale: proposedEdits.rationale,
        pullQuote: proposedEdits.pullQuote,
      })
      .from(proposedEdits)
      .where(eq(proposedEdits.id, res.id));

    expect(res.stored.title).toBe(row.title);
    expect(res.stored.body).toBe(row.newText);
    expect(res.stored.rationale).toBe(row.rationale);
    expect(res.stored.pullQuote).toBe(row.pullQuote);
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

describe("licence grant on new-article proposals", () => {
  it("records the licence and when it was granted on the row itself", async () => {
    const { db, versionId, alice } = await seed();
    const before = Date.now();
    const res = await createNewArticleProposal(db, {
      baseVersionId: versionId,
      proposerSignerId: alice,
      ...GOOD,
    });
    expect(res.ok).toBe(true);

    const [row] = await db.select().from(proposedEdits);
    expect(row.license).toBe("CC-BY-4.0");
    expect(row.licenseGrantedAt).toBeInstanceOf(Date);
    expect(row.licenseGrantedAt!.getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  it("refuses a submission that did not carry the current licence id", async () => {
    // A tab rendered before the notice existed posts no licence at all. Filing
    // it would stamp a grant on text whose author never saw the terms.
    const { db, versionId, alice } = await seed();
    for (const license of ["", "CC-BY-SA-4.0", undefined]) {
      const res = await createNewArticleProposal(db, {
        baseVersionId: versionId,
        proposerSignerId: alice,
        ...GOOD,
        license: license as string,
      });
      expect(res.ok).toBe(false);
    }
    expect(await db.select().from(proposedEdits)).toHaveLength(0);
  });

  it("exposes the recorded licence to the admin queue, null when none was granted", async () => {
    const { db, versionId, alice } = await seed();
    await createNewArticleProposal(db, {
      baseVersionId: versionId,
      proposerSignerId: alice,
      ...GOOD,
    });
    // A row filed before the grant existed: written directly, as the old code did.
    await db.insert(proposedEdits).values({
      baseVersionId: versionId,
      proposerSignerId: alice,
      kind: "new_article",
      targetAnchorId: "document-end",
      title: "Filed Before The Notice",
      newText: GOOD.body,
      rationale: GOOD.rationale,
    });

    const list = await listProposedRights(db, {
      baseVersionId: versionId,
      includeHidden: true,
    });
    const granted = list.find((p) => p.title === GOOD.title)!;
    const ungranted = list.find((p) => p.title === "Filed Before The Notice")!;
    expect(granted.license).toBe("CC-BY-4.0");
    expect(granted.licenseGrantedAt).toBeInstanceOf(Date);
    expect(ungranted.license).toBeNull();
    expect(ungranted.licenseGrantedAt).toBeNull();
  });
});
