import { eq } from "drizzle-orm";
import { signatures, signers } from "@/lib/db/schema";

/**
 * Whether the Clerk user has signed ANY version of the Bill. Used by the
 * sign-from-modal action to refuse a second signature from the form: adding
 * your name to a newer version happens only on /v/<version>.
 *
 * A plain module, not a `"use server"` one, so it is not POST-reachable.
 */
export async function hasSignedAnyVersion(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- same untyped drizzle client as @/lib/db/queries
  db: any,
  clerkUserId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: signatures.id })
    .from(signatures)
    .innerJoin(signers, eq(signers.id, signatures.signerId))
    .where(eq(signers.clerkUserId, clerkUserId))
    .limit(1);
  return rows.length > 0;
}
