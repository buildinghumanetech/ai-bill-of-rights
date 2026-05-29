"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { signers } from "@/lib/db/schema";
import { anonymizeSigner } from "@/server/signers/anonymize";
import { getDb } from "@/lib/db/lazy";

/**
 * Self-service revocation. The scrub itself lives in
 * `@/server/signers/anonymize` — a plain, non-`"use server"` module — because
 * everything exported from this file is a POST-reachable Server Function and
 * `anonymizeSigner` is keyed by a signer id that is public by design.
 *
 * This anonymizes rather than deletes: `content/consent/v1.md` tells the signer
 * that revoking converts their public signature to "Anonymized signer #N" and
 * that the signature itself remains. See the docstring on `anonymizeSigner`.
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
  await anonymizeSigner(db, rows[0].id);
  redirect("/account?revoked=1");
}
