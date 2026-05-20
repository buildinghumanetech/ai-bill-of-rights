import { describe, expect, it } from "vitest";
import { createTestDb } from "../_helpers/pglite-db";
import { syncVersions } from "@/lib/db/sync";
import { endorsements, signers, versions } from "@/lib/db/schema";
import { toggleEndorsement } from "@/server/actions/endorsements";

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
    { version: "1.0.0", publishedAt: new Date(), markdown: md, agentsMd: "stub", specJson: "{}", isCurrent: true, gitCommitSha: null },
  ]);
  const [v] = await db.select().from(versions);
  const [s] = await db.insert(signers).values({
    clerkUserId: "u1",
    displayName: "X",
    affiliation: null,
    locationText: null,
    verificationMethod: "email",
    verifiedAt: new Date(),
  }).returning({ id: signers.id });
  return { db, versionId: v.id, signerId: s.id };
}

describe("toggleEndorsement", () => {
  it("inserts on first call", async () => {
    const { db, versionId, signerId } = await seed();
    const a = await toggleEndorsement(db, { signerId, baseVersionId: versionId });
    expect(a.state).toBe("endorsed");
    const rows = await db.select().from(endorsements);
    expect(rows).toHaveLength(1);
  });
  it("removes on second call when not yet converted", async () => {
    const { db, versionId, signerId } = await seed();
    await toggleEndorsement(db, { signerId, baseVersionId: versionId });
    const b = await toggleEndorsement(db, { signerId, baseVersionId: versionId });
    expect(b.state).toBe("removed");
    const rows = await db.select().from(endorsements);
    expect(rows).toHaveLength(0);
  });
});
