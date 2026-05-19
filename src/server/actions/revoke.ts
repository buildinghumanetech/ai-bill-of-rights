"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { signers, signatures, consentRecords } from "@/lib/db/schema";

let _db: any | null = null;
function getDb() {
  if (!_db) _db = (require("@/lib/db") as { db: any }).db;
  return _db;
}

/**
 * Fully removes a signer and every dependent row. Used by the
 * user-facing revoke flow (their own row) and also exposed for tests.
 *
 * The neon-http driver does not support transactions, so we cascade
 * manually in FK-safe order: signatures → consent_records → signers.
 */
export async function deleteSigner(
  dbClient: any = null,
  signerId: string,
): Promise<void> {
  const db = dbClient ?? getDb();
  await db.delete(signatures).where(eq(signatures.signerId, signerId));
  await db.delete(consentRecords).where(eq(consentRecords.signerId, signerId));
  await db.delete(signers).where(eq(signers.id, signerId));
}

export async function submitRevokeAction(): Promise<void> {
  const { userId } = await auth();
  if (!userId) redirect("/");
  const db = getDb();
  const rows = await db
    .select({ id: signers.id })
    .from(signers)
    .where(eq(signers.clerkUserId, userId))
    .limit(1);
  if (rows.length === 0) redirect("/");
  await deleteSigner(db, rows[0].id);
  redirect("/account?revoked=1");
}
