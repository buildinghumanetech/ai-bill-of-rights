import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../_helpers/pglite-db";
import { syncVersions } from "@/lib/db/sync";
import { signers, comments, reports, versions } from "@/lib/db/schema";
import { createComment } from "@/server/actions/comments";
import { reportComment } from "@/server/actions/reports";

const md = `---
version: 1.0.0
published_at: 2026-05-18
---
# T {#preamble}
x {#preamble-s-1}
`;

async function seed() {
  const db = await createTestDb();
  await syncVersions(db, [{ version: "1.0.0", publishedAt: new Date(), markdown: md, agentsMd: "s", specJson: "{}", isCurrent: true, gitCommitSha: null }]);
  const [author] = await db.insert(signers).values({
    clerkUserId: "author", displayName: "A", affiliation: null, locationText: null,
    verificationMethod: "email", verifiedAt: new Date(),
  }).returning({ id: signers.id });
  const [v] = await db.select().from(versions).limit(1);
  const c = await createComment(db, { versionId: v.id, anchorId: "preamble-s-1", signerId: author.id, body: "x", parentCommentId: null });
  return { db, commentId: c.id };
}

describe("reportComment", () => {
  it("creates a report row", async () => {
    const { db, commentId } = await seed();
    const [reporter] = await db.insert(signers).values({
      clerkUserId: "r1", displayName: "R", affiliation: null, locationText: null,
      verificationMethod: "email", verifiedAt: new Date(),
    }).returning({ id: signers.id });
    await reportComment(db, { commentId, reporterSignerId: reporter.id, reason: "spam" });
    expect(await db.select().from(reports)).toHaveLength(1);
  });

  it("auto-hides the comment at the 5-report threshold", async () => {
    const { db, commentId } = await seed();
    for (let i = 0; i < 5; i++) {
      const [r] = await db.insert(signers).values({
        clerkUserId: `r${i}`, displayName: `R${i}`, affiliation: null, locationText: null,
        verificationMethod: "email", verifiedAt: new Date(),
      }).returning({ id: signers.id });
      await reportComment(db, { commentId, reporterSignerId: r.id, reason: null });
    }
    const [comm] = await db.select().from(comments).where(eq(comments.id, commentId));
    expect(comm.hiddenAt).not.toBeNull();
    expect(comm.hiddenReason).toMatch(/auto/i);
  });
});
