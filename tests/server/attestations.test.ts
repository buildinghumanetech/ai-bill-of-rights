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
import { validateAttestationFields } from "@/lib/attestations/validate";

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

describe("validateAttestationFields", () => {
  const valid = {
    orgName: "Acme",
    productName: "Bot",
    productUrl: "https://acme.example",
    contactEmail: "a@b.com",
  };

  it("returns null for valid input", () => {
    expect(validateAttestationFields(valid)).toBeNull();
  });

  it("accepts a null productUrl", () => {
    expect(validateAttestationFields({ ...valid, productUrl: null })).toBeNull();
  });

  it("requires orgName, productName, and contactEmail", () => {
    expect(validateAttestationFields({ ...valid, orgName: "" })).toMatch(
      /required/,
    );
    expect(validateAttestationFields({ ...valid, productName: "" })).toMatch(
      /required/,
    );
    expect(validateAttestationFields({ ...valid, contactEmail: "" })).toMatch(
      /required/,
    );
  });

  it("rejects an over-length field", () => {
    expect(
      validateAttestationFields({ ...valid, orgName: "x".repeat(201) }),
    ).toMatch(/too long/);
  });

  it("rejects a malformed email", () => {
    expect(
      validateAttestationFields({ ...valid, contactEmail: "not-an-email" }),
    ).toMatch(/valid contact email/);
  });

  it("rejects a non-http(s) product URL", () => {
    expect(
      validateAttestationFields({ ...valid, productUrl: "javascript:alert(1)" }),
    ).toMatch(/http:\/\/ or https:\/\//);
  });

  it("rejects an over-length product URL", () => {
    expect(
      validateAttestationFields({
        ...valid,
        productUrl: "https://acme.example/" + "a".repeat(500),
      }),
    ).toMatch(/Product URL is too long/);
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
