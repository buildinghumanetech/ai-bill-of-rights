import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../_helpers/pglite-db";
import { upsertSignerProfile } from "@/server/profile/upsert";
import { signers } from "@/lib/db/schema";

describe("upsertSignerProfile", () => {
  it("inserts a new signer when none exists for the Clerk user", async () => {
    const db = await createTestDb();
    await upsertSignerProfile(db, {
      clerkUserId: "user_test_123",
      displayName: "María García",
      affiliation: "Universidad",
      locationText: "Madrid",
      verificationMethod: "email",
    });
    const rows = await db
      .select()
      .from(signers)
      .where(eq(signers.clerkUserId, "user_test_123"));
    expect(rows[0].displayName).toBe("María García");
  });

  it("updates an existing signer when called twice", async () => {
    const db = await createTestDb();
    await upsertSignerProfile(db, {
      clerkUserId: "user_test_123",
      displayName: "M.",
      affiliation: null,
      locationText: null,
      verificationMethod: "email",
    });
    await upsertSignerProfile(db, {
      clerkUserId: "user_test_123",
      displayName: "María García",
      affiliation: "Universidad",
      locationText: "Madrid",
      verificationMethod: "email",
    });
    const rows = await db
      .select()
      .from(signers)
      .where(eq(signers.clerkUserId, "user_test_123"));
    expect(rows).toHaveLength(1);
    expect(rows[0].displayName).toBe("María García");
    expect(rows[0].affiliation).toBe("Universidad");
  });
});
