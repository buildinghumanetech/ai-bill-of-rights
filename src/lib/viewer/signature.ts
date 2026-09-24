import { and, eq } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";
import { getDb } from "@/lib/db/lazy";
import { getSignatureNumber } from "@/lib/db/queries";
import { signatures, signers, versions } from "@/lib/db/schema";

/**
 * The person looking at the page, when they have signed the CURRENT version.
 *
 * This is what lets the site stop treating a signer as a stranger once they
 * close the thank-you step: the headline, the floating button, the live banner
 * and the signer lists all read it. Someone who signed only an earlier version
 * is deliberately `null` here — they are still offered the re-affirm prompt,
 * not told "thank you" for a version they haven't signed.
 */
export type ViewerSignature = {
  signerId: string;
  signerNumber: number;
};

/**
 * A plain module, not a `"use server"` one: everything exported from a
 * `"use server"` file is POST-reachable, and this only ever answers about the
 * session's own identity, which `auth()` supplies.
 *
 * Never throws. A page render must not fail because this lookup did — the
 * worst case is a signer seeing the stranger's view for one page load.
 */
export async function getViewerSignature(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- same untyped drizzle client as @/lib/db/queries
  db: any = null,
): Promise<ViewerSignature | null> {
  try {
    const { userId } = await auth();
    if (!userId) return null;
    const client = db ?? getDb();
    const rows = await client
      .select({ signerId: signers.id })
      .from(signers)
      .innerJoin(signatures, eq(signatures.signerId, signers.id))
      .innerJoin(versions, eq(versions.id, signatures.versionId))
      .where(and(eq(signers.clerkUserId, userId), eq(versions.isCurrent, true)))
      .limit(1);
    const signerId: string | undefined = rows[0]?.signerId;
    if (!signerId) return null;
    return { signerId, signerNumber: await getSignatureNumber(signerId, client) };
  } catch (err) {
    console.error("[viewer] could not resolve the viewer's signature:", err);
    return null;
  }
}
