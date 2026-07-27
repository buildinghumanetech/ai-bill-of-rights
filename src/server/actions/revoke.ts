"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { signers } from "@/lib/db/schema";
import { deleteSigner } from "@/server/signers/delete";

let _db: any | null = null;
function getDb() {
  if (!_db) _db = (require("@/lib/db") as { db: any }).db;
  return _db;
}

/**
 * Self-service account deletion. The cascade itself lives in
 * `@/server/signers/delete` — a plain, non-`"use server"` module — because
 * everything exported from this file is a POST-reachable Server Function and
 * `deleteSigner` is keyed by a signer id that is public by design.
 */
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
