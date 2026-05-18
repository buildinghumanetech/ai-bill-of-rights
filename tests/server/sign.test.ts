import { describe, expect, it } from "vitest";
import { createTestDb } from "../_helpers/pglite-db";
import { recordSignature } from "@/server/actions/sign";
import { signatures, consentRecords, signers } from "@/lib/db/schema";
import { syncVersions } from "@/lib/db/sync";
import { renderConsentText, CURRENT_CONSENT_VERSION } from "@/lib/consent/render";
import { sha256Hex } from "@/lib/consent/hash";

const sampleMarkdown = `---
version: 1.0.0
published_at: 2026-05-18
---

# T {#preamble}
x {#preamble-s-1}
`;

describe("recordSignature", () => {
  it("inserts signers, consent_records, and signatures atomically", async () => {
    const db = await createTestDb();
    await syncVersions(db, [
      {
        version: "1.0.0",
        publishedAt: new Date("2026-05-18T00:00:00Z"),
        markdown: sampleMarkdown,
        agentsMd: "stub",
        specJson: "{}",
        isCurrent: true,
        gitCommitSha: null,
      },
    ]);
    const [signer] = await db
      .insert(signers)
      .values({
        clerkUserId: "user_test_123",
        displayName: "Test User",
        affiliation: null,
        locationText: null,
        verificationMethod: "email",
        verifiedAt: new Date(),
      })
      .returning({ id: signers.id });

    await recordSignature(db, {
      signerId: signer.id,
      versionString: "1.0.0",
      consentTextHash:
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
      capturedFields: { ip: "203.0.113.45" } as any,
    });

    const sigs = await db.select().from(signatures);
    expect(sigs).toHaveLength(1);
    const records = await db.select().from(consentRecords);
    expect(records).toHaveLength(1);
    expect(records[0].consentTextHash).toMatch(/^ba7816/);
    expect(sigs[0].consentRecordId).toBe(records[0].id);
  });

  it("rejects double-signing the same version by the same signer", async () => {
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
    const [signer] = await db
      .insert(signers)
      .values({
        clerkUserId: "user_test_123",
        displayName: "Test",
        affiliation: null,
        locationText: null,
        verificationMethod: "email",
        verifiedAt: new Date(),
      })
      .returning({ id: signers.id });

    await recordSignature(db, {
      signerId: signer.id,
      versionString: "1.0.0",
      consentTextHash: "a".repeat(64),
      capturedFields: {} as any,
    });
    await expect(
      recordSignature(db, {
        signerId: signer.id,
        versionString: "1.0.0",
        consentTextHash: "b".repeat(64),
        capturedFields: {} as any,
      }),
    ).rejects.toThrow();
  });

  // C-1: consent_text_hash round-trip — the hash stored must equal the hash of
  // the text that was rendered using the exact same inputs (sessionUtc fixed).
  it("stores a consent_text_hash that round-trips through renderConsentText", async () => {
    const db = await createTestDb();
    await syncVersions(db, [
      {
        version: "1.0.0",
        publishedAt: new Date("2026-05-18T00:00:00Z"),
        markdown: sampleMarkdown,
        agentsMd: "stub",
        specJson: "{}",
        isCurrent: true,
        gitCommitSha: null,
      },
    ]);
    const [signer] = await db
      .insert(signers)
      .values({
        clerkUserId: "user_c1_test",
        displayName: "C1 User",
        affiliation: "Test Org",
        locationText: "Test City",
        verificationMethod: "email",
        verifiedAt: new Date(),
      })
      .returning({ id: signers.id });

    // Fix the sessionUtc so both the "display" render and the "submit" render
    // use the exact same timestamp — the core of the C-1 fix.
    const sessionUtc = "2026-05-18T12:00:00.000Z";
    const capturedFields = {
      ip: "198.51.100.1",
      ip_geo_city: "Springfield",
      ip_geo_region: "IL",
      ip_geo_country: "US",
      user_agent_raw: "Test/1.0",
      browser_name: "TestBrowser",
      browser_version: "99",
      os_name: "Linux",
      os_version: "5.15",
      device_type: "desktop",
      screen_resolution: "1920x1080",
      timezone: "America/Chicago",
      language: "en-US",
      referrer: "",
      signing_session_utc: sessionUtc,
    };

    // Reproduce what the consent page renders (what the user sees).
    const renderedText = renderConsentText(CURRENT_CONSENT_VERSION, {
      displayName: "C1 User",
      location: "Test City",
      affiliation: "Test Org",
      verificationMethod: "email",
      fields: capturedFields,
    });
    const expectedHash = sha256Hex(renderedText);

    // Record the signature using that same hash.
    await recordSignature(db, {
      signerId: signer.id,
      versionString: "1.0.0",
      consentTextHash: expectedHash,
      capturedFields: capturedFields as any,
    });

    const records = await db.select().from(consentRecords);
    expect(records).toHaveLength(1);
    // Hash in DB must equal sha256(renderConsentText(...same inputs...)).
    expect(records[0].consentTextHash).toBe(expectedHash);
    // Double-check by re-rendering with the same inputs.
    const reRendered = renderConsentText(CURRENT_CONSENT_VERSION, {
      displayName: "C1 User",
      location: "Test City",
      affiliation: "Test Org",
      verificationMethod: "email",
      fields: capturedFields,
    });
    expect(sha256Hex(reRendered)).toBe(records[0].consentTextHash);
  });

  // C-2: transaction rollback — a double-submit that causes the signatures
  // insert to fail must NOT leave an orphan consent_records row behind.
  it("rolls back consent_records when signatures insert fails (double-submit)", async () => {
    const db = await createTestDb();
    await syncVersions(db, [
      {
        version: "1.0.0",
        publishedAt: new Date("2026-05-18T00:00:00Z"),
        markdown: sampleMarkdown,
        agentsMd: "stub",
        specJson: "{}",
        isCurrent: true,
        gitCommitSha: null,
      },
    ]);
    const [signer] = await db
      .insert(signers)
      .values({
        clerkUserId: "user_c2_test",
        displayName: "C2 User",
        affiliation: null,
        locationText: null,
        verificationMethod: "email",
        verifiedAt: new Date(),
      })
      .returning({ id: signers.id });

    // First submission succeeds — 1 consent_record, 1 signature.
    await recordSignature(db, {
      signerId: signer.id,
      versionString: "1.0.0",
      consentTextHash: "a".repeat(64),
      capturedFields: {} as any,
    });

    // Second submission (double-submit) must fail due to the unique index on
    // (signer_id, version_id) in signatures.
    await expect(
      recordSignature(db, {
        signerId: signer.id,
        versionString: "1.0.0",
        consentTextHash: "b".repeat(64),
        capturedFields: {} as any,
      }),
    ).rejects.toThrow();

    // The transaction must have rolled back: only the original consent_record
    // should remain (not 2), proving no orphan was created.
    const records = await db.select().from(consentRecords);
    expect(records).toHaveLength(1);
    expect(records[0].consentTextHash).toBe("a".repeat(64));
  });
});
