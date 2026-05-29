import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../_helpers/pglite-db";
import { syncVersions } from "@/lib/db/sync";
import { attestations } from "@/lib/db/schema";
import {
  createAttestation,
  verifyAttestationToken,
  approveAttestation,
  hideAttestation,
} from "@/server/actions/attestations";
import { enforceRateLimit } from "@/lib/ratelimit/enforce";

const ATTESTATION_COUNT_SQL = `SELECT count(*)::int as n FROM attestations WHERE submitter_ip_hash = $1 AND claimed_at > now() - interval '1 hour'`;

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
      publishedAt: new Date(),
      markdown: sampleMarkdown,
      agentsMd: "stub",
      specJson: "{}",
      isCurrent: true,
      gitCommitSha: null,
    },
  ]);
  return db;
}

describe("createAttestation", () => {
  it("inserts a row with a verification_token and published=false", async () => {
    const db = await seed();
    const result = await createAttestation(db, {
      orgName: "Acme Robotics",
      productName: "AcmeBot",
      productUrl: "https://acme.example",
      versionString: "1.0.0",
      contactEmail: "ada@acme.example",
    });
    expect(result.verificationToken).toMatch(/^[a-f0-9]{32}$/);
    const rows = await db.select().from(attestations);
    expect(rows).toHaveLength(1);
    expect(rows[0].published).toBe(false);
    expect(rows[0].needsManualReview).toBe(false);
    expect(rows[0].emailVerifiedAt).toBeNull();
  });

  it("flags needs_manual_review for frontier-lab org names", async () => {
    const db = await seed();
    await createAttestation(db, {
      orgName: "OpenAI",
      productName: "ChatGPT",
      productUrl: null,
      versionString: "1.0.0",
      contactEmail: "a@b.com",
    });
    const [row] = await db.select().from(attestations);
    expect(row.needsManualReview).toBe(true);
  });
});

describe("attestation submitter IP hash + rate limit", () => {
  it("persists submitterIpHash on the row", async () => {
    const db = await seed();
    await createAttestation(db, {
      orgName: "Acme",
      productName: "Bot",
      productUrl: null,
      versionString: "1.0.0",
      contactEmail: "a@b.com",
      submitterIpHash: "hash-abc",
    });
    const [row] = await db.select().from(attestations);
    expect(row.submitterIpHash).toBe("hash-abc");
  });

  it("rate-limit countSql blocks once the per-IP limit is reached", async () => {
    const db = await seed();
    const hash = "deadbeefdeadbeef";
    const opts = {
      bucket: "attestation",
      signerId: hash,
      windowSec: 3600,
      max: 5,
      countSql: ATTESTATION_COUNT_SQL,
    };
    for (let i = 0; i < 4; i++) {
      await createAttestation(db, {
        orgName: `Org ${i}`,
        productName: "P",
        productUrl: null,
        versionString: "1.0.0",
        contactEmail: "a@b.com",
        submitterIpHash: hash,
      });
    }
    // 4 existing rows < 5 → still allowed.
    await expect(enforceRateLimit(db, opts)).resolves.toBeUndefined();
    // A different IP is unaffected.
    await expect(
      enforceRateLimit(db, { ...opts, signerId: "other-ip" }),
    ).resolves.toBeUndefined();
    // 5th row reaches the limit → next attempt blocked.
    await createAttestation(db, {
      orgName: "Org 5",
      productName: "P",
      productUrl: null,
      versionString: "1.0.0",
      contactEmail: "a@b.com",
      submitterIpHash: hash,
    });
    await expect(enforceRateLimit(db, opts)).rejects.toThrow(/Rate limit/);
  });
});

describe("verifyAttestationToken", () => {
  it("publishes a non-flagged attestation on token confirmation", async () => {
    const db = await seed();
    const { verificationToken } = await createAttestation(db, {
      orgName: "Acme",
      productName: "Bot",
      productUrl: null,
      versionString: "1.0.0",
      contactEmail: "a@b.com",
    });
    const result = await verifyAttestationToken(db, verificationToken);
    expect(result.published).toBe(true);
    const [row] = await db.select().from(attestations);
    expect(row.published).toBe(true);
    expect(row.emailVerifiedAt).not.toBeNull();
  });

  it("does NOT publish a flagged attestation on token confirmation (admin must approve)", async () => {
    const db = await seed();
    const { verificationToken } = await createAttestation(db, {
      orgName: "OpenAI",
      productName: "GPT",
      productUrl: null,
      versionString: "1.0.0",
      contactEmail: "a@b.com",
    });
    const result = await verifyAttestationToken(db, verificationToken);
    expect(result.published).toBe(false);
    expect(result.needsManualReview).toBe(true);
    const [row] = await db.select().from(attestations);
    expect(row.emailVerifiedAt).not.toBeNull();
    expect(row.published).toBe(false);
  });

  it("throws on unknown token", async () => {
    const db = await seed();
    await expect(verifyAttestationToken(db, "deadbeef".repeat(4))).rejects.toThrow();
  });
});

describe("approveAttestation / hideAttestation", () => {
  it("approveAttestation publishes a flagged + email-verified row", async () => {
    const db = await seed();
    const { verificationToken } = await createAttestation(db, {
      orgName: "OpenAI",
      productName: "GPT",
      productUrl: null,
      versionString: "1.0.0",
      contactEmail: "a@b.com",
    });
    await verifyAttestationToken(db, verificationToken);
    const [row] = await db.select().from(attestations);
    await approveAttestation(db, row.id);
    const [after] = await db.select().from(attestations);
    expect(after.published).toBe(true);
    expect(after.manuallyApproved).toBe(true);
    expect(after.manuallyReviewedAt).not.toBeNull();
  });

  it("hideAttestation sets hidden_at on a published row", async () => {
    const db = await seed();
    const { verificationToken } = await createAttestation(db, {
      orgName: "Acme",
      productName: "Bot",
      productUrl: null,
      versionString: "1.0.0",
      contactEmail: "a@b.com",
    });
    await verifyAttestationToken(db, verificationToken);
    const [row] = await db.select().from(attestations);
    await hideAttestation(db, row.id, "false claim");
    const [after] = await db.select().from(attestations);
    expect(after.hiddenAt).not.toBeNull();
  });
});
