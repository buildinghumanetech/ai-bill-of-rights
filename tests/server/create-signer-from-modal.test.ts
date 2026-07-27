/**
 * Tests for the comment-only account creation behavior.
 *
 * `createSignerFromModal` wraps `upsertSignerProfile` + auth() + Clerk,
 * so we test the underlying data-layer contracts directly:
 *   1. upsertSignerProfile creates a signer row without inserting a signatures row.
 *   2. Calling upsertSignerProfile again with the same clerkUserId is idempotent
 *      (alreadyExists-equivalent: returns same id, no duplicate rows).
 *   3. The commentAccountCreated email template renders expected content.
 */

import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../_helpers/pglite-db";
import { upsertSignerProfile } from "@/server/profile/upsert";
import { signers, signatures } from "@/lib/db/schema";
import { commentAccountCreated } from "@/lib/email/templates";

describe("createSignerFromModal — data-layer contracts", () => {
  it("creates a signer row without inserting a signatures row", async () => {
    const db = await createTestDb();

    await upsertSignerProfile(db, {
      clerkUserId: "user_comment_only_1",
      displayName: "Jane D***",
      affiliation: null,
      locationText: "San Francisco, CA, US",
      verificationMethod: "email",
      notificationPreference: "major",
    });

    const signerRows = await db
      .select()
      .from(signers)
      .where(eq(signers.clerkUserId, "user_comment_only_1"));
    expect(signerRows).toHaveLength(1);
    expect(signerRows[0].displayName).toBe("Jane D***");

    // No signature row should exist — comment-only accounts don't sign.
    const sigRows = await db.select().from(signatures);
    expect(sigRows).toHaveLength(0);
  });

  it("is idempotent: second call with same clerkUserId does not create a duplicate (alreadyExists)", async () => {
    const db = await createTestDb();

    await upsertSignerProfile(db, {
      clerkUserId: "user_comment_only_2",
      displayName: "John S***",
      affiliation: null,
      locationText: null,
      verificationMethod: "email",
    });

    // Second call — simulates the alreadyExists path in createSignerFromModal.
    await upsertSignerProfile(db, {
      clerkUserId: "user_comment_only_2",
      displayName: "John S***",
      affiliation: null,
      locationText: null,
      verificationMethod: "email",
    });

    const signerRows = await db
      .select()
      .from(signers)
      .where(eq(signers.clerkUserId, "user_comment_only_2"));
    expect(signerRows).toHaveLength(1);

    // Still no signatures row.
    const sigRows = await db.select().from(signatures);
    expect(sigRows).toHaveLength(0);
  });
});

describe("commentAccountCreated email template", () => {
  it("renders expected subject and mentions accountUrl", () => {
    const tpl = commentAccountCreated({
      displayName: "Jane D***",
      siteUrl: "https://ai-for-people.org",
      accountUrl: "https://ai-for-people.org/account",
    });

    expect(tpl.subject).toBe("Welcome to the AI Bill of Rights discussion");
    expect(tpl.text).toContain("Jane D***");
    expect(tpl.text).toContain("https://ai-for-people.org/account");
    // Must NOT mention "signed" (this is not a signature confirmation).
    expect(tpl.text).not.toContain("signed the AI Bill of Rights");
  });

  it("does not include sign-confirmation language (wrong template guard)", () => {
    const tpl = commentAccountCreated({
      displayName: "Bob",
      siteUrl: "https://ai-for-people.org",
      accountUrl: "https://ai-for-people.org/account",
    });
    // The sign-confirmation template includes "v0.0.1"; this one must not.
    expect(tpl.text).not.toMatch(/v\d+\.\d+\.\d+/);
  });
});
