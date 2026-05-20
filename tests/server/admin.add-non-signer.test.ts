/**
 * Tests for adminAddNonSignerAction — the admin-only path that creates a
 * signer row + consent record WITHOUT a signature row.
 *
 * We test via the exported `insertNonSigner` data-layer function to avoid
 * needing to mock Clerk auth. The action wrapper (`adminAddNonSignerAction`)
 * just calls requireAdminOrBootstrap() then delegates to insertNonSigner.
 */

import { describe, expect, it } from "vitest";
import { createTestDb } from "../_helpers/pglite-db";
import { insertNonSigner } from "@/server/actions/admin";
import { signers, signatures, consentRecords } from "@/lib/db/schema";

describe("insertNonSigner (data layer for adminAddNonSignerAction)", () => {
  it("creates a signer row with the provided input fields", async () => {
    const db = await createTestDb();

    const result = await insertNonSigner(db, {
      displayName: "Jane Doe",
      affiliation: "Test Org",
      locationText: "San Francisco, CA",
      verificationMethod: "email",
      contactValue: "jane@example.com",
      isAdmin: false,
      notificationPreference: "major",
      adminSignerId: null,
    });

    expect(result.success).toBe(true);
    expect(result.signerId).toBeTruthy();

    const rows = await db.select().from(signers);
    expect(rows).toHaveLength(1);
    expect(rows[0].displayName).toBe("Jane Doe");
    expect(rows[0].affiliation).toBe("Test Org");
    expect(rows[0].locationText).toBe("San Francisco, CA");
    expect(rows[0].verificationMethod).toBe("email");
    expect(rows[0].isAdmin).toBe(false);
    expect(rows[0].notificationPreference).toBe("major");
    // Synthetic clerk_user_id should have our prefix
    expect(rows[0].clerkUserId).toMatch(/^admin-added-non-signer-/);
    expect(rows[0].id).toBe(result.signerId);
  });

  it("creates a consent record with source = admin_added_non_signer", async () => {
    const db = await createTestDb();

    const result = await insertNonSigner(db, {
      displayName: "Bob Smith",
      affiliation: "",
      locationText: "",
      verificationMethod: "sms",
      contactValue: "+15551234567",
      isAdmin: false,
      notificationPreference: "none",
      adminSignerId: "some-admin-id",
    });

    expect(result.success).toBe(true);

    const consents = await db.select().from(consentRecords);
    expect(consents).toHaveLength(1);
    expect(consents[0].signerId).toBe(result.signerId);

    const fields = consents[0].capturedFields as Record<string, unknown>;
    expect(fields.source).toBe("admin_added_non_signer");
    expect(fields.admin_signer_id).toBe("some-admin-id");
    expect(fields.contact_method).toBe("sms");
    expect(fields.contact_value).toBe("+15551234567");
  });

  it("does NOT create a signatures row", async () => {
    const db = await createTestDb();

    await insertNonSigner(db, {
      displayName: "Alice Green",
      affiliation: "",
      locationText: "",
      verificationMethod: "email",
      isAdmin: false,
      notificationPreference: "major",
      adminSignerId: null,
    });

    const sigs = await db.select().from(signatures);
    expect(sigs).toHaveLength(0);
  });

  it("returns error when displayName is empty string", async () => {
    const db = await createTestDb();

    const result = await insertNonSigner(db, {
      displayName: "",
      affiliation: "",
      locationText: "",
      verificationMethod: "email",
      isAdmin: false,
      notificationPreference: "major",
      adminSignerId: null,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Display name is required.");

    // No rows should have been inserted
    const rows = await db.select().from(signers);
    expect(rows).toHaveLength(0);
  });

  it("returns error when displayName is whitespace-only", async () => {
    const db = await createTestDb();

    const result = await insertNonSigner(db, {
      displayName: "   ",
      affiliation: "",
      locationText: "",
      verificationMethod: "email",
      isAdmin: false,
      notificationPreference: "major",
      adminSignerId: null,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Display name is required.");
  });
});
