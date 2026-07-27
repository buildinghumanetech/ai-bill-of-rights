"use server";

import { eq } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { selfies, signers } from "@/lib/db/schema";
import {
  SELFIE_AUTO_HIDE_THRESHOLD,
  rejectionReasonToText,
  type RejectionReason,
} from "@/lib/selfie/policy";
import { countUnresolvedReports } from "@/lib/selfie/queries";
import { getCurrentAdmin } from "@/lib/admin/check";
import {
  approveSelfie,
  rejectSelfie,
  removeMySelfie,
  reportSelfie,
  resolveSelfieReports,
  submitSelfie,
} from "@/server/selfies/core";

// The selfie writes themselves live in `@/server/selfies/core`, a plain
// module, because everything exported from this file is a POST-reachable
// Server Function and each of those functions takes the acting (or
// *reviewing*) signer id as a plain argument. Here every one of them is
// handed an id established by `auth()` or `requireAdminId()`.

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
