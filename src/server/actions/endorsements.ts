"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import { endorsements, signers } from "@/lib/db/schema";

let _db: any | null = null;
function getDb() {
  if (!_db) _db = (require("@/lib/db") as { db: any }).db;
  return _db;
}

export async function toggleEndorsement(
  db: any,
  input: { signerId: string; baseVersionId: string },
): Promise<{ state: "endorsed" | "removed" }> {
  const existing = await db
    .select()
    .from(endorsements)
    .where(and(eq(endorsements.signerId, input.signerId), eq(endorsements.baseVersionId, input.baseVersionId)))
    .limit(1);
  if (existing.length > 0 && !existing[0].convertedAt) {
    await db
      .delete(endorsements)
      .where(and(eq(endorsements.signerId, input.signerId), eq(endorsements.baseVersionId, input.baseVersionId)));
    return { state: "removed" };
  }
  if (existing.length > 0) {
    // Already converted to a real signature — treat as "endorsed" no-op rather than re-insert.
    return { state: "endorsed" };
  }
  await db.insert(endorsements).values({ signerId: input.signerId, baseVersionId: input.baseVersionId });
  return { state: "endorsed" };
}

export async function toggleEndorsementAction(baseVersionId: string): Promise<{
  ok: boolean;
  error?: string;
  state?: "endorsed" | "removed";
}> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "Not signed in." };
  const db = getDb();
  const me = await db
    .select({ id: signers.id, softBannedAt: signers.softBannedAt })
    .from(signers)
    .where(eq(signers.clerkUserId, userId))
    .limit(1);
  if (me.length === 0) return { ok: false, error: "Sign first to endorse." };
  if (me[0].softBannedAt) return { ok: false, error: "This account is suspended." };
  const res = await toggleEndorsement(db, { signerId: me[0].id, baseVersionId });
  revalidatePath("/proposed");
  return { ok: true, state: res.state };
}
