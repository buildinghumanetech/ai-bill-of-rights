"use server";

import { randomUUID } from "node:crypto";
import { and, eq, gte, isNull, sql } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { selfies, selfieReports, signers } from "@/lib/db/schema";
import { processSelfieImage } from "@/lib/images/process";
import {
  REJECTION_REASONS,
  SELFIE_AUTO_HIDE_THRESHOLD,
  SELFIE_RATE_LIMIT_PER_HOUR,
  rejectionReasonToText,
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
import { getCurrentAdmin } from "@/lib/admin/check";

let _db: any | null = null;
function getDb() {
  if (!_db) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _db = require("@/lib/db").db;
  }
  return _db;
}

async function requireAdminId(): Promise<string> {
  const ctx = await getCurrentAdmin();
  if (ctx.state !== "admin") {
    throw new Error("Forbidden: admin only");
  }
  return ctx.signer.id;
}

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
        display: processed.display,
        thumbnail: processed.thumbnail,
      },
      input.blobBackend,
    );

    await db.insert(selfies).values({
      id: selfieId,
      signerId: input.signerId,
      status: "pending",
      displayBlobUrl: uploaded.displayUrl,
      thumbnailBlobUrl: uploaded.thumbnailUrl,
      captureMethod: input.captureMethod,
    });

    return { selfieId };
  } catch (err) {
    if (uploaded) {
      await deleteSelfieBlobsByUrls(
        {
          displayUrl: uploaded.displayUrl,
          thumbnailUrl: uploaded.thumbnailUrl,
        },
        input.blobBackend,
      );
    }
    throw err;
  }
}

export type SubmitSelfieResult =
  | { success: true; selfieId: string }
  | { success: false; error: string };

export async function submitSelfieAction(
  formData: FormData,
): Promise<SubmitSelfieResult> {
  const { userId } = await auth();
  if (!userId) return { success: false, error: "Sign in required." };

  const file = formData.get("photo");
  if (!(file instanceof File)) {
    return { success: false, error: "No photo provided" };
  }
  const captureMethodRaw = String(formData.get("captureMethod") ?? "upload");
  const captureMethod = captureMethodRaw === "live" ? "live" : "upload";

  const signerRows = await getDb()
    .select()
    .from(signers)
    .where(eq(signers.clerkUserId, userId))
    .limit(1);
  if (signerRows.length === 0) {
    return { success: false, error: "No signer profile found." };
  }
  const signer = signerRows[0];

  const arrayBuf = await file.arrayBuffer();
  try {
    const { selfieId } = await submitSelfie(getDb(), {
      signerId: signer.id,
      buffer: Buffer.from(arrayBuf),
      mime: file.type || "application/octet-stream",
      captureMethod,
    });
    revalidatePath("/account");
    revalidatePath(`/signatories/${signer.id}`);
    // Best-effort admin notification — never blocks the user's submission.
    notifyAdminOfNewSelfie(signer.displayName).catch((err) => {
      console.error("[selfie] admin notification failed:", err);
    });
    return { success: true, selfieId };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Couldn't submit photo.",
    };
  }
}

const ADMIN_NOTIFICATION_EMAIL = "hello@ai-for-people.org";

async function notifyAdminOfNewSelfie(displayName: string): Promise<void> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const reviewUrl = `${siteUrl}/admin/selfies`;
  const { selfieSubmittedAdminNotification } = await import(
    "@/lib/email/templates"
  );
  const { sendEmail } = await import("@/lib/email/send");
  await sendEmail({
    to: ADMIN_NOTIFICATION_EMAIL,
    ...selfieSubmittedAdminNotification({ displayName, reviewUrl }),
  });
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
  blobBackend?: SelfieBlobBackend;
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

  // A rejected photo was never cleared for public display — delete its blobs
  // so it doesn't linger in (public) storage. Best-effort; never throws.
  await deleteSelfieBlobsByUrls(
    {
      displayUrl: rows[0].displayBlobUrl,
      thumbnailUrl: rows[0].thumbnailBlobUrl,
    },
    input.blobBackend,
  );
}

async function emailSelfieDecision(
  selfieId: string,
  kind: "approved" | "rejected",
  reason?: RejectionReason,
): Promise<void> {
  try {
    const [target] = await getDb()
      .select({
        signerId: selfies.signerId,
        displayName: signers.displayName,
        clerkUserId: signers.clerkUserId,
      })
      .from(selfies)
      .innerJoin(signers, eq(signers.id, selfies.signerId))
      .where(eq(selfies.id, selfieId))
      .limit(1);
    if (!target) return;
    const clerkClientFn = (await import("@clerk/nextjs/server")).clerkClient;
    const clerk = await clerkClientFn();
    const user = await clerk.users.getUser(target.clerkUserId);
    const email = user.primaryEmailAddress?.emailAddress;
    if (!email) return;
    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    const tpl = await import("@/lib/email/templates");
    const { sendEmail } = await import("@/lib/email/send");
    if (kind === "approved") {
      await sendEmail({
        to: email,
        ...tpl.selfieApproved({
          displayName: target.displayName,
          signerPageUrl: `${siteUrl}/signatories/${target.signerId}`,
          accountUrl: `${siteUrl}/account`,
        }),
      });
    } else {
      await sendEmail({
        to: email,
        ...tpl.selfieRejected({
          displayName: target.displayName,
          reasonText: rejectionReasonToText(reason ?? "other"),
          accountUrl: `${siteUrl}/account`,
        }),
      });
    }
  } catch (err) {
    console.error("[selfie] decision email failed:", err);
  }
}

export async function approveSelfieAction(selfieId: string): Promise<void> {
  const adminId = await requireAdminId();
  await approveSelfie(getDb(), { selfieId, adminSignerId: adminId });
  await emailSelfieDecision(selfieId, "approved");
  revalidatePath("/admin/selfies");
  revalidatePath("/signatories");
}

export async function rejectSelfieAction(
  selfieId: string,
  reason: RejectionReason,
  note?: string,
): Promise<void> {
  const adminId = await requireAdminId();
  await rejectSelfie(getDb(), {
    selfieId,
    adminSignerId: adminId,
    reason,
    note,
  });
  await emailSelfieDecision(selfieId, "rejected", reason);
  revalidatePath("/admin/selfies");
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
  blobBackend?: SelfieBlobBackend;
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
    // Capture the blob URLs before we lose track of them, flip to rejected,
    // then delete the blobs — hidden-on-report content should not stay live.
    const [target] = await db
      .select({
        displayBlobUrl: selfies.displayBlobUrl,
        thumbnailBlobUrl: selfies.thumbnailBlobUrl,
      })
      .from(selfies)
      .where(eq(selfies.id, input.selfieId))
      .limit(1);
    await db
      .update(selfies)
      .set({
        status: "rejected",
        rejectionReason: "other",
        reviewedAt: new Date(),
        reviewedBy: input.adminSignerId,
      })
      .where(eq(selfies.id, input.selfieId));
    if (target) {
      await deleteSelfieBlobsByUrls(
        {
          displayUrl: target.displayBlobUrl,
          thumbnailUrl: target.thumbnailBlobUrl,
        },
        input.blobBackend,
      );
    }
  }
}

async function emailSelfieAutoHidden(selfieId: string): Promise<void> {
  try {
    const [target] = await getDb()
      .select({
        displayName: signers.displayName,
        clerkUserId: signers.clerkUserId,
      })
      .from(selfies)
      .innerJoin(signers, eq(signers.id, selfies.signerId))
      .where(eq(selfies.id, selfieId))
      .limit(1);
    if (!target) return;
    const clerkClientFn = (await import("@clerk/nextjs/server")).clerkClient;
    const clerk = await clerkClientFn();
    const user = await clerk.users.getUser(target.clerkUserId);
    const email = user.primaryEmailAddress?.emailAddress;
    if (!email) return;
    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    const { selfieAutoHidden } = await import("@/lib/email/templates");
    const { sendEmail } = await import("@/lib/email/send");
    await sendEmail({
      to: email,
      ...selfieAutoHidden({
        displayName: target.displayName,
        appealUrl: `${siteUrl}/account`,
      }),
    });
  } catch (err) {
    console.error("[selfie] auto-hidden email failed:", err);
  }
}

export async function reportSelfieAction(
  selfieId: string,
  reason?: string,
): Promise<void> {
  const { userId } = await auth();
  if (!userId) throw new Error("Sign in to report");
  const reporterRows = await getDb()
    .select({ id: signers.id })
    .from(signers)
    .where(eq(signers.clerkUserId, userId))
    .limit(1);
  if (reporterRows.length === 0) throw new Error("Sign in to report");

  const beforeUnresolved = await countUnresolvedReports(selfieId, getDb());
  await reportSelfie(getDb(), {
    selfieId,
    reporterSignerId: reporterRows[0].id,
    reason,
  });
  const afterUnresolved = await countUnresolvedReports(selfieId, getDb());
  // If this report crossed the threshold, send the auto-hidden email.
  if (
    beforeUnresolved < SELFIE_AUTO_HIDE_THRESHOLD &&
    afterUnresolved >= SELFIE_AUTO_HIDE_THRESHOLD
  ) {
    await emailSelfieAutoHidden(selfieId);
  }
}

export async function resolveSelfieReportsAction(
  selfieId: string,
  resolution: "allowed" | "hidden",
): Promise<void> {
  const adminId = await requireAdminId();
  await resolveSelfieReports(getDb(), {
    selfieId,
    adminSignerId: adminId,
    resolution,
  });
  if (resolution === "hidden") {
    await emailSelfieDecision(selfieId, "rejected", "other");
  }
  revalidatePath("/admin/selfies");
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
    // The disclaimer promises users can remove their photo anytime — so delete
    // its blobs from (public) storage before marking the row removed.
    await deleteSelfieBlobsByUrls(
      { displayUrl: row.displayBlobUrl, thumbnailUrl: row.thumbnailBlobUrl },
      input.blobBackend,
    );
    await db
      .update(selfies)
      .set({ removedAt: new Date() })
      .where(eq(selfies.id, row.id));
  }
}

export async function removeMySelfieAction(): Promise<void> {
  const { userId } = await auth();
  if (!userId) redirect("/");
  const signerRows = await getDb()
    .select({ id: signers.id })
    .from(signers)
    .where(eq(signers.clerkUserId, userId))
    .limit(1);
  if (signerRows.length === 0) redirect("/");
  await removeMySelfie(getDb(), { signerId: signerRows[0].id });
  revalidatePath("/account");
  revalidatePath(`/signatories/${signerRows[0].id}`);
}
