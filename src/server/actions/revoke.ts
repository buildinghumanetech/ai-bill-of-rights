"use server";

import { eq, sql } from "drizzle-orm";
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
 * manually in FK-safe order. Production DB still has Phase 3 tables
 * (comments, comment_upvotes, reports) left over from an earlier
 * db:push — those FKs would block the signers delete if we didn't
 * clean them up here. The raw SQL is a no-op if those tables don't
 * exist.
 */
export async function deleteSigner(
  dbClient: any = null,
  signerId: string,
): Promise<void> {
  const db = dbClient ?? getDb();
  await db.execute(sql`
    DELETE FROM reports
    WHERE reporter_signer_id = ${signerId} OR resolved_by = ${signerId}
       OR comment_id IN (SELECT id FROM comments WHERE signer_id = ${signerId})
  `);
  await db.execute(sql`
    DELETE FROM comment_upvotes
    WHERE signer_id = ${signerId}
       OR comment_id IN (SELECT id FROM comments WHERE signer_id = ${signerId})
  `);
  await db.execute(sql`DELETE FROM comments WHERE signer_id = ${signerId}`);
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
