"use server";

import { eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import {
  signers,
  signatures,
  consentRecords,
  selfies,
  selfieReports,
} from "@/lib/db/schema";
import { deleteSelfieBlobsByUrls } from "@/lib/storage/blob";
import type { SelfieBlobBackend } from "@/lib/storage/blob";

let _db: any | null = null;
function getDb() {
  if (!_db) _db = (require("@/lib/db") as { db: any }).db;
  return _db;
}

/**
 * Run a delete against a table that MAY not exist (Phase 3 leftovers). If the
 * table is absent, the underlying driver throws "relation does not exist" —
 * we swallow that and only that. Other errors propagate.
 */
async function tryDeleteLegacy(db: any, tableName: string, stmt: any): Promise<void> {
  try {
    await db.execute(stmt);
  } catch (err: any) {
    const msg = String(err?.message ?? err?.cause?.message ?? "");
    if (
      msg.includes(`relation "${tableName}" does not exist`) ||
      msg.includes(`"public.${tableName}" does not exist`)
    ) {
      return; // table absent — fine
    }
    throw err;
  }
}

/**
 * Fully removes a signer and every dependent row. Used by the
 * user-facing revoke flow (their own row) and also exposed for tests.
 *
 * The neon-http driver does not support transactions, so we cascade
 * manually in FK-safe order. We use `to_regclass` checks for the legacy
 * Phase 3 tables (comments, comment_upvotes, reports) that may exist
 * in some production DBs from an earlier db:push but are NOT in the
 * current schema — this keeps the cleanup safe in both prod and pglite.
 *
 * The `blobBackend` arg lets tests swap a fake; in prod the default
 * Vercel Blob backend is used.
 */
export async function deleteSigner(
  dbClient: any = null,
  signerId: string,
  blobBackend?: SelfieBlobBackend,
): Promise<void> {
  const db = dbClient ?? getDb();

  // 1) Best-effort delete the signer's selfie blobs before destroying rows.
  const signerSelfies = await db
    .select({
      originalBlobUrl: selfies.originalBlobUrl,
      displayBlobUrl: selfies.displayBlobUrl,
      thumbnailBlobUrl: selfies.thumbnailBlobUrl,
    })
    .from(selfies)
    .where(eq(selfies.signerId, signerId));
  for (const s of signerSelfies) {
    await deleteSelfieBlobsByUrls(
      {
        originalUrl: s.originalBlobUrl,
        displayUrl: s.displayBlobUrl,
        thumbnailUrl: s.thumbnailBlobUrl,
      },
      blobBackend,
    );
  }

  // 2) Selfie reports — both authored by this signer AND against this
  //    signer's selfies. Delete authored first so the second statement
  //    can rely on the FK to selfies still being present.
  await db
    .delete(selfieReports)
    .where(eq(selfieReports.reporterSignerId, signerId));
  await db.execute(sql`
    DELETE FROM selfie_reports
    WHERE selfie_id IN (SELECT id FROM selfies WHERE signer_id = ${signerId})
  `);
  await db.delete(selfies).where(eq(selfies.signerId, signerId));

  // 3) Defensive cascade through legacy Phase 3 tables that may exist on
  //    prod (left behind by an earlier db:push) but not on pglite or the
  //    cleaned dev branch. tryDeleteLegacy swallows "relation does not
  //    exist" as a no-op so a missing table is treated as nothing to delete.
  //
  //    Order matters: reports.comment_id → comments.id FK,
  //    comment_upvotes.comment_id → comments.id FK. Both join tables must
  //    be cleared of rows referencing this signer's comments BEFORE the
  //    comments themselves are deleted.
  await tryDeleteLegacy(db, "reports", sql`
    DELETE FROM reports
    WHERE reporter_signer_id = ${signerId} OR resolved_by = ${signerId}
       OR comment_id IN (SELECT id FROM comments WHERE signer_id = ${signerId})
  `);
  await tryDeleteLegacy(db, "comment_upvotes", sql`
    DELETE FROM comment_upvotes
    WHERE signer_id = ${signerId}
       OR comment_id IN (SELECT id FROM comments WHERE signer_id = ${signerId})
  `);
  await tryDeleteLegacy(db, "comments", sql`
    DELETE FROM comments WHERE signer_id = ${signerId}
  `);

  // 4) Core Phase 1 tables — always present.
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
