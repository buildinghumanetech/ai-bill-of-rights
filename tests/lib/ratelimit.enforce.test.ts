import { describe, expect, it } from "vitest";
import { createTestDb } from "../_helpers/pglite-db";
import { syncVersions } from "@/lib/db/sync";
import { signers, comments, versions } from "@/lib/db/schema";
import { enforceRateLimit, RateLimitError } from "@/lib/ratelimit/enforce";

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
    { version: "1.0.0", publishedAt: new Date(), markdown: md, agentsMd: "s", specJson: "{}", isCurrent: true, gitCommitSha: null },
  ]);
  const [s] = await db.insert(signers).values({
    clerkUserId: "u1", displayName: "T", affiliation: null, locationText: null,
    verificationMethod: "email", verifiedAt: new Date(),
  }).returning({ id: signers.id });
  return { db, signerId: s.id };
}

describe("enforceRateLimit", () => {
  it("allows when count is below limit", async () => {
    const { db, signerId } = await seed();
    await expect(
      enforceRateLimit(db, {
        table: comments,
        timestampColumn: comments.createdAt,
        whereSignerColumn: comments.signerId,
        signerId,
        windowSeconds: 60,
        limit: 5,
        errorMessage: "Too many comments",
      })
    ).resolves.toEqual({ allowed: true });
  });

  it("throws when count is at or above limit", async () => {
    const { db, signerId } = await seed();
    const [version] = await db.select().from(versions).limit(1);
    for (let i = 0; i < 5; i++) {
      await db.insert(comments).values({
        versionId: version.id,
        anchorId: "preamble-s-1",
        signerId,
        body: `comment ${i}`,
      });
    }
    await expect(
      enforceRateLimit(db, {
        table: comments,
        timestampColumn: comments.createdAt,
        whereSignerColumn: comments.signerId,
        signerId,
        windowSeconds: 60,
        limit: 5,
        errorMessage: "Too many comments",
      })
    ).rejects.toThrow(RateLimitError);
  });
});
