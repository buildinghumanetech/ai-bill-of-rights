import { describe, expect, it } from "vitest";
import * as schema from "@/lib/db/schema";

describe("db schema", () => {
  it("exports all current tables", () => {
    expect(schema.versions).toBeDefined();
    expect(schema.signers).toBeDefined();
    expect(schema.signatures).toBeDefined();
    expect(schema.consentRecords).toBeDefined();
    expect(schema.attestations).toBeDefined();
  });

  it("signers has clerk_user_id as unique text column", () => {
    const col = schema.signers.clerkUserId;
    expect(col).toBeDefined();
  });

  it("consent_records.captured_fields is jsonb", () => {
    expect(schema.consentRecords.capturedFields).toBeDefined();
  });
});
