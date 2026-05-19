import { describe, expect, it } from "vitest";
import { createTestDb } from "../_helpers/pglite-db";
import { syncVersions } from "@/lib/db/sync";
import { signers, versions } from "@/lib/db/schema";
import { listCommentsForAnchor, countCommentsByAnchor, listPendingReports } from "@/lib/db/queries";
import { createComment } from "@/server/actions/comments";
import { reportComment } from "@/server/actions/reports";

const md = `---
version: 1.0.0
published_at: 2026-05-18
---
# T {#preamble}
x {#preamble-s-1} y {#preamble-s-2}
`;

async function seed() {
  const db = await createTestDb();
  await syncVersions(db, [{ version: "1.0.0", publishedAt: new Date(), markdown: md, agentsMd: "s", specJson: "{}", isCurrent: true, gitCommitSha: null }]);
  const [u1] = await db.insert(signers).values({
    clerkUserId: "u1", displayName: "Alice", affiliation: "Acme", locationText: "Paris",
    verificationMethod: "email", verifiedAt: new Date(),
  }).returning({ id: signers.id });
  const [v] = await db.select().from(versions).limit(1);
  return { db, signerId: u1.id, versionId: v.id };
}

describe("listCommentsForAnchor", () => {
  it("returns visible comments with signer display info", async () => {
    const { db, signerId, versionId } = await seed();
    await createComment(db, { versionId, anchorId: "preamble-s-1", signerId, body: "hi", parentCommentId: null });
    const rows = await listCommentsForAnchor(db, versionId, "preamble-s-1");
    expect(rows).toHaveLength(1);
    expect(rows[0].body).toBe("hi");
    expect(rows[0].displayName).toBe("Alice");
  });
});

describe("countCommentsByAnchor", () => {
  it("returns counts per anchor for a version", async () => {
    const { db, signerId, versionId } = await seed();
    await createComment(db, { versionId, anchorId: "preamble-s-1", signerId, body: "1", parentCommentId: null });
    await createComment(db, { versionId, anchorId: "preamble-s-1", signerId, body: "2", parentCommentId: null });
    await createComment(db, { versionId, anchorId: "preamble-s-2", signerId, body: "3", parentCommentId: null });
    const counts = await countCommentsByAnchor(db, versionId);
    expect(counts["preamble-s-1"]).toBe(2);
    expect(counts["preamble-s-2"]).toBe(1);
  });
});

describe("listPendingReports", () => {
  it("returns unresolved reports", async () => {
    const { db, signerId, versionId } = await seed();
    const c = await createComment(db, { versionId, anchorId: "preamble-s-1", signerId, body: "x", parentCommentId: null });
    await reportComment(db, { commentId: c.id, reporterSignerId: signerId, reason: "spam" });
    const pending = await listPendingReports(db);
    expect(pending).toHaveLength(1);
  });
});
