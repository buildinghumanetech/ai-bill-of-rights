import { describe, expect, it } from "vitest";
import { createTestDb } from "../_helpers/pglite-db";
import { syncVersions } from "@/lib/db/sync";
import {
  listPublishedAttestations,
  listPendingReviewAttestations,
} from "@/lib/db/queries";
import { createAttestation, verifyAttestationToken } from "@/server/actions/attestations";

const markdown = `---
version: 1.0.0
published_at: 2026-05-18
---

# T {#preamble}
x {#preamble-s-1}
`;

async function seed() {
  const db = await createTestDb();
  await syncVersions(db, [
    { version: "1.0.0", publishedAt: new Date(), markdown, agentsMd: "s", specJson: "{}", isCurrent: true, gitCommitSha: null },
  ]);
  return db;
}

describe("listPublishedAttestations", () => {
  it("returns only published, non-hidden attestations", async () => {
    const db = await seed();
    const a = await createAttestation(db, { orgName: "Acme", productName: "Bot", productUrl: null, versionString: "1.0.0", contactEmail: "x@y" });
    await createAttestation(db, { orgName: "Beta", productName: "Bot2", productUrl: null, versionString: "1.0.0", contactEmail: "x@y" });
    await verifyAttestationToken(db, a.verificationToken);
    const rows = await listPublishedAttestations(db, { limit: 10, offset: 0 });
    expect(rows.map((r) => r.orgName)).toEqual(["Acme"]);
  });

  it("filters by versionString", async () => {
    const db = await seed();
    const a = await createAttestation(db, { orgName: "Acme", productName: "Bot", productUrl: null, versionString: "1.0.0", contactEmail: "x@y" });
    await verifyAttestationToken(db, a.verificationToken);
    expect(await listPublishedAttestations(db, { limit: 10, offset: 0, versionString: "1.0.0" })).toHaveLength(1);
    expect(await listPublishedAttestations(db, { limit: 10, offset: 0, versionString: "9.9.9" })).toHaveLength(0);
  });
});

describe("listPendingReviewAttestations", () => {
  it("returns email-verified, flagged, not-yet-reviewed, not-hidden", async () => {
    const db = await seed();
    const openai = await createAttestation(db, { orgName: "OpenAI", productName: "GPT", productUrl: null, versionString: "1.0.0", contactEmail: "x@y" });
    await verifyAttestationToken(db, openai.verificationToken);
    const pending = await listPendingReviewAttestations(db);
    expect(pending).toHaveLength(1);
    expect(pending[0].orgName).toBe("OpenAI");
  });
});
