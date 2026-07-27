import { auth } from "@clerk/nextjs/server";
import { count, eq } from "drizzle-orm";
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
  | { state: "no-admins-yet"; signer: SignerRecord }
  | { state: "not-admin"; signer: SignerRecord }
  | { state: "admin"; signer: SignerRecord };

/**
 * Resolves the current Clerk session into an admin state.
 *
 * Bootstrap path: when no admin exists yet in the system, any signed-in
 * signer can promote themselves to the first admin (see bootstrapAdminAction
 * in src/server/actions/admin.ts). After that, only existing admins can
 * grant the role to others.
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

  const adminCount = await db
    .select({ value: count() })
    .from(signers)
    .where(eq(signers.isAdmin, true));
  const adminTotal = Number(adminCount[0]?.value ?? 0);

  if (adminTotal === 0) {
    return { state: "no-admins-yet", signer };
  }
  return { state: "not-admin", signer };
}
