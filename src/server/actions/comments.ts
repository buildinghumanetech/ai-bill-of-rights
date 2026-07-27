"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import { comments, signers, commentMentions } from "@/lib/db/schema";
import {
  createComment,
  deleteComment,
  editComment,
  sanitizeText,
} from "@/server/comments/core";
import { enforceRateLimit } from "@/lib/ratelimit/enforce";
import { getCurrentAdmin } from "@/lib/admin/check";
import { listSignersForMention } from "@/lib/db/queries";
import { parseMentions } from "@/lib/comments/mentions";
import { mentionEmail } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/send";

let _db: any | null = null;
function getDb() {
  if (!_db) _db = (require("@/lib/db") as { db: any }).db;
  return _db;
}

/**
 * The create/edit/delete writes live in `@/server/comments/core`, a plain
 * module, because everything exported from this file is a POST-reachable
 * Server Function and those functions take the acting signer id — and, for
 * edit/delete, an `isAdmin` boolean — as plain arguments.
 */
export async function submitCommentAction(formData: FormData): Promise<{ ok: boolean; error?: string; id?: string }> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "Not signed in." };
  const db = getDb();
  const me = await db
    .select({ id: signers.id, softBannedAt: signers.softBannedAt, isAdmin: signers.isAdmin })
    .from(signers)
    .where(eq(signers.clerkUserId, userId))
    .limit(1);
  if (me.length === 0) return { ok: false, error: "Sign first to comment." };
  if (me[0].softBannedAt) {
    return { ok: false, error: "This account is suspended pending moderator review." };
  }

  const baseVersionId = String(formData.get("baseVersionId") ?? "");
  const anchorId = formData.get("anchorId")?.toString() || undefined;
  const proposalId = formData.get("proposalId")?.toString() || undefined;
  const parentCommentId = formData.get("parentCommentId")?.toString() || undefined;
  const rawBody = String(formData.get("body") ?? "");
  const body = sanitizeText(rawBody, 5000);
  const rawSelectedText = formData.get("selectedText")?.toString() ?? "";
  const selectedText = rawSelectedText ? sanitizeText(rawSelectedText, 1000) : null;

  // Admin "post as" feature: if caller is admin and actAsSignerId is provided,
  // attribute the comment to that signer. Otherwise use the caller's own id.
  let effectiveSignerId = me[0].id;
  const actAsSignerId = formData.get("actAsSignerId")?.toString() ?? "";
  if (actAsSignerId && me[0].isAdmin) {
    const target = await db
      .select({ id: signers.id })
      .from(signers)
      .where(eq(signers.id, actAsSignerId))
      .limit(1);
    if (target.length === 1) effectiveSignerId = target[0].id;
  }

  try {
    await enforceRateLimit(db, {
      bucket: "comment",
      signerId: me[0].id,
      windowSec: 3600,
      max: 20,
      countSql: `SELECT count(*)::int as n FROM comments WHERE signer_id = $1 AND created_at > now() - interval '1 hour'`,
    });
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  let insertedCommentId: string;
  try {
    const result = await createComment(db, {
      baseVersionId,
      signerId: effectiveSignerId,
      anchorId,
      proposalId,
      parentCommentId,
      body,
      selectedText,
    });
    insertedCommentId = result.id;
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  // Fire mention emails asynchronously — don't let email failures block the response
  void (async () => {
    try {
      const knownSigners = await listSignersForMention(db);
      const mentions = parseMentions(body, knownSigners);
      // Filter self-mentions
      const others = mentions.filter((m) => m.signerId !== effectiveSignerId);
      if (others.length === 0) return;

      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
      const commentUrl = `${siteUrl}/proposed?c=${encodeURIComponent(insertedCommentId)}`;

      // Find the mentioning signer's display name
      const mentioner = knownSigners.find((s) => s.id === effectiveSignerId);
      const mentioningDisplayName = mentioner?.displayName ?? "Someone";

      // Look up the mentioned signer's clerkUserId to get email from Clerk
      const { clerkClient } = await import("@clerk/nextjs/server");
      const clerk = await clerkClient();

      await Promise.all(
        others.map(async (mention) => {
          try {
            // Insert mention row (ignore unique-constraint violations)
            await db.insert(commentMentions).values({
              commentId: insertedCommentId,
              mentionedSignerId: mention.signerId,
            }).onConflictDoNothing();

            // Fetch the mentioned signer's clerkUserId to get email
            const mentionedRow = await db
              .select({ clerkUserId: signers.clerkUserId, displayName: signers.displayName })
              .from(signers)
              .where(eq(signers.id, mention.signerId))
              .limit(1);
            if (mentionedRow.length === 0) return;

            const clerkUser = await clerk.users.getUser(mentionedRow[0].clerkUserId);
            // Best-effort email resolution: primary first, then any verified
            // address, then any address at all. SMS-only users will have
            // none — we log the miss so it's auditable, and rely on the
            // mention row in `comment_mentions` so the user can still see the
            // mention next time they visit. (SMS delivery would require
            // wiring Twilio or a similar provider — not in place yet.)
            const emailCandidates = [
              clerkUser.primaryEmailAddress?.emailAddress,
              ...clerkUser.emailAddresses
                .filter((e) => e.verification?.status === "verified")
                .map((e) => e.emailAddress),
              ...clerkUser.emailAddresses.map((e) => e.emailAddress),
            ].filter((v): v is string => Boolean(v));
            const email = emailCandidates[0];
            if (!email) {
              const hasPhone = (clerkUser.phoneNumbers?.length ?? 0) > 0;
              console.warn(
                "[mention] No email for mentioned signer — notification skipped",
                {
                  signerId: mention.signerId,
                  displayName: mentionedRow[0].displayName,
                  hasPhone,
                  commentId: insertedCommentId,
                },
              );
              return;
            }

            const tmpl = mentionEmail({
              mentionedDisplayName: mentionedRow[0].displayName,
              mentioningDisplayName,
              body,
              commentUrl,
              selectedText: selectedText ?? null,
            });
            await sendEmail({ to: email, subject: tmpl.subject, text: tmpl.text, html: tmpl.html });
          } catch (innerErr) {
            console.error("[mention] Failed to send mention email:", innerErr);
          }
        }),
      );
    } catch (outerErr) {
      console.error("[mention] Failed to process mentions:", outerErr);
    }
  })();

  revalidatePath("/");
  return { ok: true, id: insertedCommentId };
}

export async function hideCommentAction(
  commentId: string,
  reason: string = "Admin hidden",
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getCurrentAdmin();
  if (ctx.state !== "admin") return { ok: false, error: "Forbidden." };
  await getDb()
    .update(comments)
    .set({ hiddenAt: new Date(), hiddenReason: reason })
    .where(eq(comments.id, commentId));
  revalidatePath("/");
  revalidatePath("/admin/comments");
  return { ok: true };
}

export async function unhideCommentAction(commentId: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getCurrentAdmin();
  if (ctx.state !== "admin") return { ok: false, error: "Forbidden." };
  await getDb()
    .update(comments)
    .set({ hiddenAt: null, hiddenReason: null })
    .where(eq(comments.id, commentId));
  revalidatePath("/");
  revalidatePath("/admin/comments");
  return { ok: true };
}

/**
 * Soft-delete a comment. Authors can delete their own; admins can delete anyone's.
 * Replaces the old admin-only deleteCommentAction.
 */
export async function deleteCommentAction(commentId: string): Promise<{ ok: boolean; error?: string }> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "Not signed in." };
  const db = getDb();

  const me = await db
    .select({ id: signers.id, isAdmin: signers.isAdmin })
    .from(signers)
    .where(eq(signers.clerkUserId, userId))
    .limit(1);
  if (me.length === 0) return { ok: false, error: "Signer not found." };

  const res = await deleteComment(db, commentId, me[0].id, Boolean(me[0].isAdmin));
  if (!res.ok) return res;

  revalidatePath("/admin/comments");
  revalidatePath("/proposed");
  revalidatePath("/");
  return { ok: true };
}

/**
 * Edit a comment's body. Authors can edit their own; admins can edit anyone's.
 */
export async function editCommentAction(
  commentId: string,
  newBody: string,
): Promise<{ ok: boolean; error?: string }> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "Not signed in." };
  const db = getDb();

  const me = await db
    .select({ id: signers.id, isAdmin: signers.isAdmin })
    .from(signers)
    .where(eq(signers.clerkUserId, userId))
    .limit(1);
  if (me.length === 0) return { ok: false, error: "Signer not found." };

  const res = await editComment(db, commentId, newBody, me[0].id, Boolean(me[0].isAdmin));
  if (!res.ok) return res;

  revalidatePath("/proposed");
  revalidatePath("/");
  return { ok: true };
}
