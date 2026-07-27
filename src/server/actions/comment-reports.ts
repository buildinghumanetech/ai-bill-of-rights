"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import { signers } from "@/lib/db/schema";
import {
  reportComment,
  toggleReportComment,
} from "@/server/comments/reports";

let _db: any | null = null;
function getDb() {
  if (!_db) _db = (require("@/lib/db") as { db: any }).db;
  return _db;
}

/**
 * The report writes live in `@/server/comments/reports`, a plain module,
 * because everything exported from this file is a POST-reachable Server
 * Function and both take the reporting signer id as an argument.
 */
/** Legacy — kept for backward compat with admin code. */
export async function reportCommentAction(commentId: string): Promise<{
  ok: boolean;
  error?: string;
  state?: "reported" | "already_reported";
}> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "Not signed in." };
  const db = getDb();
  const me = await db
    .select({ id: signers.id, softBannedAt: signers.softBannedAt })
    .from(signers)
    .where(eq(signers.clerkUserId, userId))
    .limit(1);
  if (me.length === 0) return { ok: false, error: "Sign first to flag." };
  if (me[0].softBannedAt) return { ok: false, error: "This account is suspended." };

  const res = await reportComment(db, { signerId: me[0].id, commentId });
  revalidatePath("/proposed");
  revalidatePath("/admin/comment-reports");
  return { ok: true, state: res.state };
}

export async function toggleReportCommentAction(commentId: string): Promise<{
  ok: boolean;
  error?: string;
  state?: "flagged" | "unflagged";
}> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "Not signed in." };
  const db = getDb();
  const me = await db
    .select({ id: signers.id, softBannedAt: signers.softBannedAt })
    .from(signers)
    .where(eq(signers.clerkUserId, userId))
    .limit(1);
  if (me.length === 0) return { ok: false, error: "Sign first to flag." };
  if (me[0].softBannedAt) return { ok: false, error: "This account is suspended." };

  const res = await toggleReportComment(db, { signerId: me[0].id, commentId });
  revalidatePath("/proposed");
  revalidatePath("/admin/comment-reports");
  return { ok: true, state: res.state };
}
