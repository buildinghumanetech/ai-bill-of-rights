import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../_helpers/pglite-db";
import { signers, comments, versions } from "@/lib/db/schema";
import { syncVersions } from "@/lib/db/sync";
import {
  enforceRateLimit,
  enforceEphemeralRateLimit,
  resetEphemeralRateLimits,
} from "@/lib/ratelimit/enforce";

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
});

/**
 * The in-process sibling, used where the rate-limited write leaves no durable
 * row to count — today that is "why I signed", which is an UPDATE of a column
 * on `signers`. Same options, same error; the clock is injected so the window
 * can be walked without sleeping.
 */
describe("enforceEphemeralRateLimit", () => {
  beforeEach(() => resetEphemeralRateLimits());

  const opts = (now: number) => ({
    bucket: "why_i_signed",
    key: "signer-1",
    windowSec: 3600,
    max: 3,
    now,
  });

  it("allows up to max inside the window then throws", () => {
    for (let i = 0; i < 3; i++) {
      expect(() => enforceEphemeralRateLimit(opts(1_000 + i))).not.toThrow();
    }
    expect(() => enforceEphemeralRateLimit(opts(1_003))).toThrow(/rate limit/i);
  });

  it("lets the window slide rather than locking the key out forever", () => {
    for (let i = 0; i < 3; i++) enforceEphemeralRateLimit(opts(1_000));
    expect(() => enforceEphemeralRateLimit(opts(1_000))).toThrow();
    // One hour and a bit later the earlier attempts have aged out.
    expect(() =>
      enforceEphemeralRateLimit(opts(1_000 + 3_601_000)),
    ).not.toThrow();
  });

  it("does not let refused attempts hold the window open", () => {
    for (let i = 0; i < 3; i++) enforceEphemeralRateLimit(opts(0));
    // A client retrying in a tight loop for the whole window...
    for (let t = 0; t < 3_600_000; t += 60_000) {
      expect(() => enforceEphemeralRateLimit(opts(t))).toThrow();
    }
    // ...still gets in once the ORIGINAL three attempts expire.
    expect(() => enforceEphemeralRateLimit(opts(3_600_001))).not.toThrow();
  });

  it("keeps separate buckets and separate keys apart", () => {
    for (let i = 0; i < 3; i++) enforceEphemeralRateLimit(opts(0));
    expect(() => enforceEphemeralRateLimit(opts(0))).toThrow();
    expect(() =>
      enforceEphemeralRateLimit({ ...opts(0), key: "signer-2" }),
    ).not.toThrow();
    expect(() =>
      enforceEphemeralRateLimit({ ...opts(0), bucket: "other" }),
    ).not.toThrow();
  });
});
