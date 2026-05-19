import { describe, expect, it } from "vitest";
import { createTestDb } from "../_helpers/pglite-db";
import {
  comments,
  commentUpvotes,
  endorsements,
  proposalUpvotes,
  proposedEdits,
  signers,
  versions,
} from "@/lib/db/schema";
import { syncVersions } from "@/lib/db/sync";

const sampleMarkdown = `---
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
      publishedAt: new Date("2026-05-18T00:00:00Z"),
      markdown: sampleMarkdown,
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
      displayName: "Test Signer",
      affiliation: null,
      locationText: null,
      verificationMethod: "email",
      verifiedAt: new Date(),
    })
    .returning({ id: signers.id });
  return { db, versionId: v.id, signerId: s.id };
}

describe("proposed_edits + adjacent tables schema", () => {
  it("inserts a proposed_edit and upvote and reads them back", async () => {
    const { db, versionId, signerId } = await seed();
    const [p] = await db
      .insert(proposedEdits)
      .values({
        baseVersionId: versionId,
        proposerSignerId: signerId,
        kind: "replace",
        targetAnchorId: "preamble-s-1",
        newText: "y",
        rationale: "shorter",
      })
      .returning({ id: proposedEdits.id, status: proposedEdits.status });
    expect(p.status).toBe("pending");

    await db
      .insert(proposalUpvotes)
      .values({ proposalId: p.id, signerId });
    const upvotes = await db.select().from(proposalUpvotes);
    expect(upvotes).toHaveLength(1);
  });

  it("inserts a comment anchored to a sentence + an upvote + reads them", async () => {
    const { db, versionId, signerId } = await seed();
    const [c] = await db
      .insert(comments)
      .values({
        baseVersionId: versionId,
        anchorId: "preamble-s-1",
        signerId,
        body: "interesting",
      })
      .returning({ id: comments.id });
    await db
      .insert(commentUpvotes)
      .values({ commentId: c.id, signerId });
    const upvotes = await db.select().from(commentUpvotes);
    expect(upvotes).toHaveLength(1);
  });

  it("inserts an endorsement and round-trips it", async () => {
    const { db, versionId, signerId } = await seed();
    await db.insert(endorsements).values({ signerId, baseVersionId: versionId });
    const rows = await db.select().from(endorsements);
    expect(rows).toHaveLength(1);
    expect(rows[0].convertedToVersionId).toBeNull();
  });
});
