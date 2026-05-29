import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { signers } from "@/lib/db/schema";
import { getDb } from "@/lib/db/lazy";

export interface SignerRecord {
  id: string;
  clerkUserId: string;
  displayName: string;
  isAdmin: boolean;
}

export type AdminCheckResult =
  | { state: "unauthenticated" }
  | { state: "not-a-signer"; clerkUserId: string }
  | { state: "not-admin"; signer: SignerRecord }
  | { state: "admin"; signer: SignerRecord };

/**
 * Resolves the current Clerk session into an admin state. Admin is granted
 * only by an existing admin (or, for the very first admin, a one-off database
 * UPDATE — there is no in-app self-promotion path).
 */
export async function getCurrentAdmin(): Promise<AdminCheckResult> {
  const { userId } = await auth();
  if (!userId) return { state: "unauthenticated" };

  const db = getDb();
  const rows = await db
    .select()
    .from(signers)
    .where(eq(signers.clerkUserId, userId))
    .limit(1);

  if (rows.length === 0) {
    return { state: "not-a-signer", clerkUserId: userId };
  }
  const signer = rows[0] as SignerRecord;

  if (signer.isAdmin) {
    return { state: "admin", signer };
  }
  return { state: "not-admin", signer };
}
