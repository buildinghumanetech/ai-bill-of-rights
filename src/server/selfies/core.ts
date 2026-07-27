/**
 * Selfie submit / review / report / remove. Deliberately NOT a `"use server"`
 * module — see `src/server/signers/delete.ts` for the reasoning.
 *
 * Every function here takes the acting signer id as a plain argument, and
 * `approveSelfie` / `rejectSelfie` / `resolveSelfieReports` take an
 * `adminSignerId` they never verify. Exported from a `"use server"` file, a
 * direct POST could upload a photo onto someone else's public profile, approve
 * or reject any pending photo without being an admin, report on other
 * signers' behalf (five unresolved reports auto-hides a photo), or take down
 * anyone's approved photo by id.
 *
 * CALLERS MUST AUTHORISE — see `src/server/actions/selfie.ts`, where
 * `requireAdminId()` establishes the admin identity for the review paths and
 * the Clerk session establishes it for the rest.
 */

import { randomUUID } from "node:crypto";
import { and, eq, gte, isNull, sql } from "drizzle-orm";
import { selfies, selfieReports } from "@/lib/db/schema";
import { processSelfieImage } from "@/lib/images/process";
import {
  REJECTION_REASONS,
  SELFIE_AUTO_HIDE_THRESHOLD,
  SELFIE_RATE_LIMIT_PER_HOUR,
  validateImageDimensions,
  validateSelfieInput,
  type RejectionReason,
} from "@/lib/selfie/policy";
import {
  deleteSelfieBlobsByUrls,
  uploadSelfieBlobs,
  type SelfieBlobBackend,
} from "@/lib/storage/blob";
import { countUnresolvedReports } from "@/lib/selfie/queries";

// =====================================================================
// submit
// =====================================================================

export interface SubmitSelfieInput {
  signerId: string;
  buffer: Buffer;
  mime: string;
  captureMethod: "live" | "upload";
  blobBackend?: SelfieBlobBackend;
}

export async function submitSelfie(
  db: any,
  input: SubmitSelfieInput,
): Promise<{ selfieId: string }> {
  const policy = validateSelfieInput({
    mime: input.mime,
    declaredSize: input.buffer.byteLength,
  });
  if (!policy.ok) {
    throw new Error(`selfie rejected: ${policy.reason}`);
  }

  // Rate limit BEFORE doing expensive image work.
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentRows = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(selfies)
    .where(
      and(
        eq(selfies.signerId, input.signerId),
        gte(selfies.submittedAt, oneHourAgo),
      ),
    );
  const recent = Number(recentRows[0]?.value ?? 0);
  if (recent >= SELFIE_RATE_LIMIT_PER_HOUR) {
    throw new Error("rate limit: too many photo submissions in the last hour");
  }

  const processed = await processSelfieImage(input.buffer);
  const dim = validateImageDimensions(
    processed.dimensions.width,
    processed.dimensions.height,
  );
  if (!dim.ok) {
    throw new Error(`selfie rejected: ${dim.reason}`);
  }

  // Pre-allocate selfie id so blob paths can use it before insert.
  const selfieId = randomUUID();
  let uploaded: Awaited<ReturnType<typeof uploadSelfieBlobs>> | null = null;
  try {
    uploaded = await uploadSelfieBlobs(
      {
        signerId: input.signerId,
        selfieId,
        original: processed.original,
        display: processed.display,
        thumbnail: processed.thumbnail,
      },
      input.blobBackend,
    );

    await db.insert(selfies).values({
      id: selfieId,
      signerId: input.signerId,
      status: "pending",
      originalBlobUrl: uploaded.originalUrl,
      displayBlobUrl: uploaded.displayUrl,
      thumbnailBlobUrl: uploaded.thumbnailUrl,
      originalMime: "image/jpeg",
      originalBytes: processed.original.byteLength,
      captureMethod: input.captureMethod,
    });

    return { selfieId };
  } catch (err) {
    if (uploaded) {
      await deleteSelfieBlobsByUrls(
        {
          originalUrl: uploaded.originalUrl,
          displayUrl: uploaded.displayUrl,
          thumbnailUrl: uploaded.thumbnailUrl,
        },
        input.blobBackend,
      );
    }
    throw err;
  }
}

// =====================================================================
// approve + reject
// =====================================================================

export interface ApproveSelfieInput {
  selfieId: string;
  adminSignerId: string;
}

export async function approveSelfie(
  db: any,
  input: ApproveSelfieInput,
): Promise<void> {
  const rows = await db
    .select()
    .from(selfies)
    .where(eq(selfies.id, input.selfieId))
    .limit(1);
  if (rows.length === 0) throw new Error("Selfie not found");
  const target = rows[0];
  if (target.status !== "pending") {
    throw new Error(`Selfie is not pending (status=${target.status})`);
  }

  // Mark any prior active selfie for this signer as replaced — preserves the
  // partial-unique invariant when the new row flips to 'approved'.
  const activeRows = await db
    .select({ id: selfies.id })
    .from(selfies)
    .where(
      and(
        eq(selfies.signerId, target.signerId),
        eq(selfies.status, "approved"),
        isNull(selfies.autoHiddenAt),
        isNull(selfies.removedAt),
        isNull(selfies.replacedBySelfieId),
      ),
    );
  for (const a of activeRows) {
    await db
      .update(selfies)
      .set({ replacedBySelfieId: input.selfieId })
      .where(eq(selfies.id, a.id));
  }

  await db
    .update(selfies)
    .set({
      status: "approved",
      reviewedAt: new Date(),
      reviewedBy: input.adminSignerId,
    })
    .where(eq(selfies.id, input.selfieId));
}

export interface RejectSelfieInput {
  selfieId: string;
  adminSignerId: string;
  reason: RejectionReason;
  note?: string;
}

export async function rejectSelfie(
  db: any,
  input: RejectSelfieInput,
): Promise<void> {
  if (!(REJECTION_REASONS as readonly string[]).includes(input.reason)) {
    throw new Error(`Invalid rejection reason: ${input.reason}`);
  }
  const rows = await db
    .select()
    .from(selfies)
    .where(eq(selfies.id, input.selfieId))
    .limit(1);
  if (rows.length === 0) throw new Error("Selfie not found");
  if (rows[0].status !== "pending") {
    throw new Error(`Selfie is not pending (status=${rows[0].status})`);
  }
  await db
    .update(selfies)
    .set({
      status: "rejected",
      reviewedAt: new Date(),
      reviewedBy: input.adminSignerId,
      rejectionReason: input.reason,
      rejectionNote: input.note ?? null,
    })
    .where(eq(selfies.id, input.selfieId));
}

// =====================================================================
// report + resolve
// =====================================================================

export interface ReportSelfieInput {
  selfieId: string;
  reporterSignerId: string;
  reason?: string;
}

export async function reportSelfie(
  db: any,
  input: ReportSelfieInput,
): Promise<void> {
  // Idempotent insert — if the same reporter already reported this selfie,
  // the unique index makes the insert fail. We swallow that specific case.
  try {
    await db.insert(selfieReports).values({
      selfieId: input.selfieId,
      reporterSignerId: input.reporterSignerId,
      reason: input.reason ?? null,
    });
  } catch (err: any) {
    const msg = String(err?.message ?? err?.cause?.message ?? "");
    if (msg.includes("unique") || String(err?.code ?? "") === "23505") return;
    throw err;
  }

  const unresolved = await countUnresolvedReports(input.selfieId, db);
  if (unresolved < SELFIE_AUTO_HIDE_THRESHOLD) return;

  // Only auto-hide approved, currently-visible selfies.
  const [target] = await db
    .select({ status: selfies.status, autoHiddenAt: selfies.autoHiddenAt })
    .from(selfies)
    .where(eq(selfies.id, input.selfieId))
    .limit(1);
  if (!target || target.status !== "approved" || target.autoHiddenAt !== null) {
    return;
  }
  await db
    .update(selfies)
    .set({ autoHiddenAt: new Date() })
    .where(eq(selfies.id, input.selfieId));
}

export interface ResolveSelfieReportsInput {
  selfieId: string;
  adminSignerId: string;
  resolution: "allowed" | "hidden";
}

export async function resolveSelfieReports(
  db: any,
  input: ResolveSelfieReportsInput,
): Promise<void> {
  await db
    .update(selfieReports)
    .set({
      resolvedAt: new Date(),
      resolvedBy: input.adminSignerId,
      resolution: input.resolution,
    })
    .where(
      and(
        eq(selfieReports.selfieId, input.selfieId),
        isNull(selfieReports.resolvedAt),
      ),
    );

  if (input.resolution === "allowed") {
    await db
      .update(selfies)
      .set({ autoHiddenAt: null })
      .where(eq(selfies.id, input.selfieId));
  } else {
    await db
      .update(selfies)
      .set({
        status: "rejected",
        rejectionReason: "other",
        reviewedAt: new Date(),
        reviewedBy: input.adminSignerId,
      })
      .where(eq(selfies.id, input.selfieId));
  }
}

// =====================================================================
// removeMine
// =====================================================================

export interface RemoveMySelfieInput {
  signerId: string;
  blobBackend?: SelfieBlobBackend;
}

export async function removeMySelfie(
  db: any,
  input: RemoveMySelfieInput,
): Promise<void> {
  const rows = await db
    .select()
    .from(selfies)
    .where(
      and(
        eq(selfies.signerId, input.signerId),
        eq(selfies.status, "approved"),
        isNull(selfies.removedAt),
        isNull(selfies.replacedBySelfieId),
      ),
    );
  for (const row of rows) {
    // Best-effort delete public derivatives. The original is kept for an
    // audit window — it gets purged only on full /account/revoke.
    await deleteSelfieBlobsByUrls(
      {
        originalUrl: null,
        displayUrl: row.displayBlobUrl,
        thumbnailUrl: row.thumbnailBlobUrl,
      },
      input.blobBackend,
    );
    await db
      .update(selfies)
      .set({ removedAt: new Date() })
      .where(eq(selfies.id, row.id));
  }
}
