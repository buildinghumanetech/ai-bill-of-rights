/**
 * Tests for assertNotLastAdmin — the guard that stops the admin count from
 * dropping to zero (which would silently re-open the self-promote bootstrap
 * path to any signer). Tested at the data layer to avoid mocking Clerk auth;
 * setAdminFlagAction / deleteSignerAction just call it after requireAdmin.
 */

import { describe, expect, it } from "vitest";
import { createTestDb } from "../_helpers/pglite-db";
import { assertNotLastAdmin } from "@/server/actions/admin";
import { signers } from "@/lib/db/schema";

async function addSigner(
  db: any,
  clerkUserId: string,
  isAdmin: boolean,
): Promise<string> {
  const [row] = await db
    .insert(signers)
    .values({
      clerkUserId,
      displayName: clerkUserId,
      verificationMethod: "email",
      verifiedAt: new Date(),
      isAdmin,
    })
    .returning({ id: signers.id });
  return row.id;
}

describe("assertNotLastAdmin", () => {
  it("throws when the target is the only admin", async () => {
    const db = await createTestDb();
    const onlyAdmin = await addSigner(db, "admin-1", true);
    await addSigner(db, "plain-1", false);

    await expect(assertNotLastAdmin(db, onlyAdmin)).rejects.toThrow(
      /last remaining admin/i,
    );
  });

  it("allows removing an admin when another admin remains", async () => {
    const db = await createTestDb();
    const adminA = await addSigner(db, "admin-a", true);
    await addSigner(db, "admin-b", true);

    await expect(assertNotLastAdmin(db, adminA)).resolves.toBeUndefined();
  });

  it("is a no-op when the target is not an admin (count is unaffected)", async () => {
    const db = await createTestDb();
    await addSigner(db, "admin-1", true);
    const plain = await addSigner(db, "plain-1", false);

    await expect(assertNotLastAdmin(db, plain)).resolves.toBeUndefined();
  });
});
