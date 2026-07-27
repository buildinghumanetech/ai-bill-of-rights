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
 * Comment ids that cannot outlive this signer. Two groups:
 *
 *  - comments they wrote, and
 *  - every comment on a proposal they authored, whoever wrote it.
 *
 * The second group is a deliberate casualty, not an oversight.
 * `proposed_edits.proposer_signer_id` is NOT NULL, so erasing the proposer
 * means erasing the proposal, and `comments.proposal_id` then has nothing left
 * to point at. Replies carry the same `proposal_id` as their parent, so this
 * one predicate covers whole threads.
 */
function doomedCommentIds(signerId: string) {
  return sql`
    SELECT id FROM comments
    WHERE signer_id = ${signerId}
       OR proposal_id IN (
            SELECT id FROM proposed_edits WHERE proposer_signer_id = ${signerId}
          )
  `;
}

/**
 * Fully removes a signer and every dependent row. This is the single cascade
 * behind all three deletion paths: the user-facing revoke flow, the
 * self-service `removeMySignature`, and the admin Delete button.
 *
 * The neon-http driver does not support transactions, so we cascade manually
 * in FK-safe order — children before parents, one statement at a time.
 * `signers.referred_by_signer_id` is the ONLY foreign key into `signers.id`
 * that carries an ON DELETE action (SET NULL); the other ~14 are bare
 * references, i.e. NO ACTION, so every one of them has to be cleared here or
 * the final `DELETE FROM signers` raises SQLSTATE 23503.
 *
 * Rows reach a signer two ways and both have to go: authored BY them
 * (endorsements, comments, votes, proposals) and attached to something they
 * authored (votes/reports/mentions on their comments, upvotes on their
 * proposals). See `doomedCommentIds` for the second group.
 *
 * Columns that record a moderation DECISION about someone else's content
 * (`proposed_edits.decided_by`, `comment_reports.resolved_by`,
 * `selfies.reviewed_by`, `selfie_reports.resolved_by`) are nulled instead of
 * cascaded. Deleting a moderator's account must not erase the proposals and
 * comments they ruled on — the decision itself (status, decided_at,
 * resolution) is other people's history and stays; only the actor's identity
 * is erased.
 *
 * `reports` is the one table handled defensively: some production DBs still
 * carry it from an earlier Phase 3 `db:push` even though it is not in
 * schema.ts, so a missing table is treated as nothing to delete. Everything
 * else touched here is in the current schema and the migrations, so its
 * absence would be a real error worth surfacing.
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

  // 2) Moderation decisions this signer made on OTHER people's content:
  //    forget who acted, keep the act. These have to happen before the final
  //    DELETE FROM signers but are order-independent among themselves, so
  //    they sit up front where the intent is easy to read.
  await db.execute(sql`
    UPDATE proposed_edits SET decided_by = NULL WHERE decided_by = ${signerId}
  `);
  await db.execute(sql`
    UPDATE comment_reports SET resolved_by = NULL WHERE resolved_by = ${signerId}
  `);
  // selfies.reviewed_by / selfie_reports.resolved_by carry no FK, so they
  // never block the delete — but they still hold this signer's id on other
  // people's rows, which erasure should not leave behind.
  await db.execute(sql`
    UPDATE selfies SET reviewed_by = NULL WHERE reviewed_by = ${signerId}
  `);
  await db.execute(sql`
    UPDATE selfie_reports SET resolved_by = NULL WHERE resolved_by = ${signerId}
  `);

  // 3) Selfie reports — both authored by this signer AND against this
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

  // 4) Legacy Phase 3 `reports` table — present on some prod DBs, absent from
  //    schema.ts and pglite. tryDeleteLegacy swallows "relation does not
  //    exist" as a no-op. It points at comments, so it goes before them.
  await tryDeleteLegacy(db, "reports", sql`
    DELETE FROM reports
    WHERE reporter_signer_id = ${signerId} OR resolved_by = ${signerId}
       OR comment_id IN (${doomedCommentIds(signerId)})
  `);

  // 5) Everything hanging off a comment, cleared before the comments go.
  //    Each statement takes rows the signer authored plus rows anyone
  //    attached to a doomed comment.
  await db.execute(sql`
    DELETE FROM comment_votes
    WHERE signer_id = ${signerId}
       OR comment_id IN (${doomedCommentIds(signerId)})
  `);
  await db.execute(sql`
    DELETE FROM comment_reports
    WHERE reporter_signer_id = ${signerId}
       OR comment_id IN (${doomedCommentIds(signerId)})
  `);
  await db.execute(sql`
    DELETE FROM comment_mentions
    WHERE mentioned_signer_id = ${signerId}
       OR comment_id IN (${doomedCommentIds(signerId)})
  `);
  await db.execute(sql`
    DELETE FROM comment_upvotes
    WHERE signer_id = ${signerId}
       OR comment_id IN (${doomedCommentIds(signerId)})
  `);

  // 6) Replies by other people to a doomed comment are detached rather than
  //    deleted — their words survive, promoted to top level. `buildTree` in
  //    lib/db/queries already treats a parentless reply as a root, so this
  //    needs no render-side change. Replies that are themselves doomed are
  //    skipped; step 7 removes parent and child in one statement, and
  //    Postgres fires RI triggers after the statement, so that is FK-safe.
  await db.execute(sql`
    UPDATE comments SET parent_comment_id = NULL
    WHERE parent_comment_id IN (${doomedCommentIds(signerId)})
      AND id NOT IN (${doomedCommentIds(signerId)})
  `);
  await db.execute(sql`
    DELETE FROM comments WHERE id IN (${doomedCommentIds(signerId)})
  `);

  // 7) Proposals: upvotes (theirs, and everyone's on their proposals) first,
  //    then the proposals. Comments on them are already gone via step 5-6.
  await db.execute(sql`
    DELETE FROM proposal_upvotes
    WHERE signer_id = ${signerId}
       OR proposal_id IN (
            SELECT id FROM proposed_edits WHERE proposer_signer_id = ${signerId}
          )
  `);
  await db.execute(sql`
    DELETE FROM proposed_edits WHERE proposer_signer_id = ${signerId}
  `);

  // 8) Endorsements of a version — nothing references them, so they can go
  //    any time before the signer row.
  await db.execute(sql`
    DELETE FROM endorsements WHERE signer_id = ${signerId}
  `);

  // 9) Core Phase 1 tables — always present.
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
