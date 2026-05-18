"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { signers, consentRecords } from "@/lib/db/schema";

// Lazy db (same pattern as other server actions / queries)
let _db: any | null = null;
function getDb() {
  if (!_db) _db = (require("@/lib/db") as { db: any }).db;
  return _db;
}

export async function anonymizeSigner(
  dbClient: any = null,
  signerId: string,
  sequenceNumber: number,
): Promise<void> {
  const db = dbClient ?? getDb();
  await db
    .update(signers)
    .set({
      displayName: `Anonymized signer #${sequenceNumber}`,
      affiliation: null,
      locationText: null,
    })
    .where(eq(signers.id, signerId));

  await db
    .update(consentRecords)
    .set({
      revokedAt: new Date(),
      capturedFields: null,
    })
    .where(eq(consentRecords.signerId, signerId));
}

async function nextSequenceNumber(dbClient: any = null): Promise<number> {
  const db = dbClient ?? getDb();
  const rows = await db.select({ name: signers.displayName }).from(signers);
  let max = 0;
  for (const r of rows) {
    const m = r.name?.match?.(/^Anonymized signer #(\d+)$/);
    if (m) {
      max = Math.max(max, Number(m[1]));
    }
  }
  return max + 1;
}

export async function submitRevokeAction(): Promise<void> {
  const { userId } = await auth();
  if (!userId) redirect("/");
  const db = getDb();
  const rows = await db
    .select()
    .from(signers)
    .where(eq(signers.clerkUserId, userId))
    .limit(1);
  if (rows.length === 0) redirect("/");
  const seq = await nextSequenceNumber(db);
  await anonymizeSigner(db, rows[0].id, seq);
  redirect("/account?revoked=1");
}
