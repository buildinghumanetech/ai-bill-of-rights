import { describe, expect, it } from "vitest";
import { createTestDb } from "../_helpers/pglite-db";
import { syncVersions } from "@/lib/db/sync";
import { proposedEdits, signers, versions } from "@/lib/db/schema";
import {
  countProposalsByAnchor,
  listProposalsByAnchor,
  getAcceptedProposalsForVersion,
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

describe("countProposalsByAnchor", () => {
  it("returns pending and accepted counts per anchor, excluding rejected/stale", async () => {
    const { db, versionId, signerId } = await seed();
    await db.insert(proposedEdits).values([
      {
        baseVersionId: versionId,
        proposerSignerId: signerId,
        kind: "replace",
        targetAnchorId: "article-01-s-1",
        newText: "Updated text.",
        status: "pending",
      },
      {
        baseVersionId: versionId,
        proposerSignerId: signerId,
        kind: "replace",
        targetAnchorId: "article-01-s-1",
        newText: "Another text.",
        status: "accepted",
      },
      {
        baseVersionId: versionId,
        proposerSignerId: signerId,
        kind: "delete",
        targetAnchorId: "article-02-s-1",
        newText: null,
        status: "rejected",
      },
      {
        baseVersionId: versionId,
        proposerSignerId: signerId,
        kind: "replace",
        targetAnchorId: "article-02-s-1",
        newText: "Different.",
        status: "pending",
      },
    ]);

    const counts = await countProposalsByAnchor(db, versionId);
    expect(counts["article-01-s-1"]).toEqual({ pending: 1, accepted: 1 });
    expect(counts["article-02-s-1"]).toEqual({ pending: 1, accepted: 0 });
    expect(counts["article-03-s-1"]).toBeUndefined();
  });
});

describe("listProposalsByAnchor", () => {
  it("returns proposals for a specific anchor ordered ASC by createdAt with displayName", async () => {
    const { db, versionId, signerId } = await seed();
    await db.insert(proposedEdits).values([
      {
        baseVersionId: versionId,
        proposerSignerId: signerId,
        kind: "replace",
        targetAnchorId: "article-01-s-1",
        newText: "First proposal.",
        status: "pending",
      },
      {
        baseVersionId: versionId,
        proposerSignerId: signerId,
        kind: "insert_after",
        targetAnchorId: "article-01-s-1",
        newText: "Inserted sentence.",
        status: "accepted",
      },
      {
        baseVersionId: versionId,
        proposerSignerId: signerId,
        kind: "replace",
        targetAnchorId: "article-02-s-1",
        newText: "Other anchor.",
        status: "pending",
      },
    ]);

    const rows = await listProposalsByAnchor(db, versionId, "article-01-s-1");
    expect(rows).toHaveLength(2);
    expect(rows[0].newText).toBe("First proposal.");
    expect(rows[0].displayName).toBe("Alice");
    expect(rows[1].kind).toBe("insert_after");
  });
});

describe("getAcceptedProposalsForVersion", () => {
  it("returns only accepted proposals for a version", async () => {
    const { db, versionId, signerId } = await seed();
    await db.insert(proposedEdits).values([
      {
        baseVersionId: versionId,
        proposerSignerId: signerId,
        kind: "replace",
        targetAnchorId: "article-01-s-1",
        newText: "Accepted replacement.",
        status: "accepted",
      },
      {
        baseVersionId: versionId,
        proposerSignerId: signerId,
        kind: "delete",
        targetAnchorId: "article-02-s-1",
        newText: null,
        status: "pending",
      },
    ]);

    const accepted = await getAcceptedProposalsForVersion(db, versionId);
    expect(accepted).toHaveLength(1);
    expect(accepted[0].status).toBe("accepted");
    expect(accepted[0].targetAnchorId).toBe("article-01-s-1");
  });
});
