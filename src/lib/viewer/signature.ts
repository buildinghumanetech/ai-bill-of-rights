import { eq } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";
import { getDb } from "@/lib/db/lazy";
import { getSignatureNumber } from "@/lib/db/queries";
import { signatures, signers, versions } from "@/lib/db/schema";

/**
 * The person looking at the page, when they have signed ANY version.
 *
 * This is what lets the site stop treating a signer as a stranger once they
 * close the thank-you step: the headline, the floating button, the live banner
 * and the signer lists all read it. Someone who signed only an earlier version
 * counts too. Their signature stands and their number never changes, so they
 * get the same "You're signer #N. Thank you." as everyone else, plus
 * `newVersion` to point them at what changed.
 */
export type ViewerSignature = {
  signerId: string;
  signerNumber: number;
  /**
   * The current version, when they have NOT signed it; null once they have.
   * Drives the optional "v0.1.0 is out. See what changed." line and the
   * "Add my name" button at the bottom of /v/<current>.
   */
  newVersion: string | null;
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
    const rows: Array<{ signerId: string; isCurrent: boolean }> = await client
      .select({ signerId: signers.id, isCurrent: versions.isCurrent })
      .from(signers)
      .innerJoin(signatures, eq(signatures.signerId, signers.id))
      .innerJoin(versions, eq(versions.id, signatures.versionId))
      .where(eq(signers.clerkUserId, userId));
    const signerId: string | undefined = rows[0]?.signerId;
    if (!signerId) return null;
    const newVersion = rows.some((r) => r.isCurrent)
      ? null
      : await currentVersionString(client);
    return {
      signerId,
      signerNumber: await getSignatureNumber(signerId, client),
      newVersion,
    };
  } catch (err) {
    console.error("[viewer] could not resolve the viewer's signature:", err);
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- same untyped drizzle client as above
async function currentVersionString(client: any): Promise<string | null> {
  const rows = await client
    .select({ version: versions.version })
    .from(versions)
    .where(eq(versions.isCurrent, true))
    .limit(1);
  return rows[0]?.version ?? null;
}
