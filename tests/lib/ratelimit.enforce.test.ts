import { describe, expect, it } from "vitest";
import { createTestDb } from "../_helpers/pglite-db";
import { signers, comments, versions } from "@/lib/db/schema";
import { syncVersions } from "@/lib/db/sync";
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

describe("enforceRateLimit", () => {
  it("allows up to N writes per window then throws", async () => {
    const { db, versionId, signerId } = await seed();
    // Pretend the rate-limited operation is inserting a comment.
    const op = async () => {
      await db.insert(comments).values({
        baseVersionId: versionId,
        anchorId: "preamble-s-1",
        signerId,
        body: "x",
      });
    };

    // 5 writes inside the window: all succeed.
    for (let i = 0; i < 5; i++) {
      await enforceRateLimit(db, {
        bucket: "comment",
        signerId,
        windowSec: 3600,
        max: 5,
        countSql: `SELECT count(*)::int as n FROM comments WHERE signer_id = $1 AND created_at > now() - interval '1 hour'`,
      });
      await op();
    }

    // 6th throws.
    await expect(
      enforceRateLimit(db, {
        bucket: "comment",
        signerId,
        windowSec: 3600,
        max: 5,
        countSql: `SELECT count(*)::int as n FROM comments WHERE signer_id = $1 AND created_at > now() - interval '1 hour'`,
      }),
    ).rejects.toThrow(/rate/i);
  });

  it("throws a typed RateLimitError, not a bare Error", async () => {
    // Callers must be able to tell "you are over the limit" from "the check
    // itself blew up" — a DB failure reported as "too many attempts" sends
    // someone away to retry something that will not fix itself. Matching the
    // message text is a contract across a module boundary that nothing
    // enforces; the type is one the compiler keeps.
    const { db, signerId } = await seed();

    const attempt = enforceRateLimit(db, {
      bucket: "reaffirm",
      signerId,
      windowSec: 3600,
      max: 0, // already over before any write
      countSql: `SELECT 0::int as n`,
    });

    await expect(attempt).rejects.toBeInstanceOf(RateLimitError);
    const err = await attempt.catch((e) => e);
    expect(err.code).toBe("rate_limited");
    expect(err.bucket).toBe("reaffirm");
    // The message is preserved: callers that surface it directly still work.
    expect(err.message).toMatch(/rate limit exceeded/i);
  });
});
