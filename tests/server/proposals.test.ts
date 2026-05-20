import { describe, expect, it } from "vitest";
import { createTestDb } from "../_helpers/pglite-db";
import { syncVersions } from "@/lib/db/sync";
import { proposedEdits, signers, versions } from "@/lib/db/schema";
import {
  createProposal,
  acceptProposal,
  rejectProposal,
} from "@/server/actions/proposals";

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
      displayName: "Alice",
      affiliation: null,
      locationText: null,
      verificationMethod: "email",
      verifiedAt: new Date(),
    })
    .returning({ id: signers.id });
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
  return { db, versionId: v.id, signerId: s.id, adminId: admin.id };
}

describe("createProposal (data layer)", () => {
  it("inserts a replace proposal with newText", async () => {
    const { db, versionId, signerId } = await seed();
    const result = await createProposal(db, {
      baseVersionId: versionId,
      proposerSignerId: signerId,
      kind: "replace",
      targetAnchorId: "article-01-s-1",
      newText: "Better wording here.",
    });
    expect(result.id).toBeDefined();
    const rows = await db.select().from(proposedEdits);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("replace");
    expect(rows[0].newText).toBe("Better wording here.");
    expect(rows[0].status).toBe("pending");
  });

  it("rejects replace kind without newText", async () => {
    const { db, versionId, signerId } = await seed();
    await expect(
      createProposal(db, {
        baseVersionId: versionId,
        proposerSignerId: signerId,
        kind: "replace",
        targetAnchorId: "article-01-s-1",
      }),
    ).rejects.toThrow(/newText is required/i);
  });

  it("allows delete kind without newText", async () => {
    const { db, versionId, signerId } = await seed();
    const result = await createProposal(db, {
      baseVersionId: versionId,
      proposerSignerId: signerId,
      kind: "delete",
      targetAnchorId: "article-01-s-1",
    });
    expect(result.id).toBeDefined();
    const rows = await db.select().from(proposedEdits);
    expect(rows[0].kind).toBe("delete");
    expect(rows[0].newText).toBeNull();
  });
});

describe("acceptProposal (data layer)", () => {
  it("marks the proposal accepted and auto-rejects conflicting pending replaces", async () => {
    const { db, versionId, signerId, adminId } = await seed();

    const p1 = await createProposal(db, {
      baseVersionId: versionId,
      proposerSignerId: signerId,
      kind: "replace",
      targetAnchorId: "article-01-s-1",
      newText: "Proposal A.",
    });
    const p2 = await createProposal(db, {
      baseVersionId: versionId,
      proposerSignerId: signerId,
      kind: "replace",
      targetAnchorId: "article-01-s-1",
      newText: "Proposal B.",
    });

    await acceptProposal(db, { proposalId: p1.id, deciderSignerId: adminId });

    const rows = await db.select().from(proposedEdits);
    const byId = Object.fromEntries(rows.map((r: any) => [r.id, r]));
    expect(byId[p1.id].status).toBe("accepted");
    expect(byId[p2.id].status).toBe("rejected");
  });

  it("auto-rejects pending insert_afters when accepting a delete", async () => {
    const { db, versionId, signerId, adminId } = await seed();

    const del = await createProposal(db, {
      baseVersionId: versionId,
      proposerSignerId: signerId,
      kind: "delete",
      targetAnchorId: "article-01-s-1",
    });
    const ins = await createProposal(db, {
      baseVersionId: versionId,
      proposerSignerId: signerId,
      kind: "insert_after",
      targetAnchorId: "article-01-s-1",
      newText: "Extra sentence.",
    });

    await acceptProposal(db, { proposalId: del.id, deciderSignerId: adminId });

    const rows = await db.select().from(proposedEdits);
    const byId = Object.fromEntries(rows.map((r: any) => [r.id, r]));
    expect(byId[del.id].status).toBe("accepted");
    expect(byId[ins.id].status).toBe("rejected");
  });
});

describe("rejectProposal (data layer)", () => {
  it("marks the proposal rejected", async () => {
    const { db, versionId, signerId, adminId } = await seed();
    const p = await createProposal(db, {
      baseVersionId: versionId,
      proposerSignerId: signerId,
      kind: "replace",
      targetAnchorId: "article-01-s-1",
      newText: "Some change.",
    });

    await rejectProposal(db, { proposalId: p.id, deciderSignerId: adminId });

    const rows = await db.select().from(proposedEdits);
    expect(rows[0].status).toBe("rejected");
    expect(rows[0].decidedBy).toBe(adminId);
  });
});
