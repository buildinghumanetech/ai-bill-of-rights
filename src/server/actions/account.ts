"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import { signatures, signers, versions } from "@/lib/db/schema";

let _db: any | null = null;
function getDb() {
  if (!_db) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _db = require("@/lib/db").db;
  }
  return _db;
}

async function getMySigner() {
  const { userId } = await auth();
  if (!userId) return null;
  const db = getDb();
  const rows = await db
    .select()
    .from(signers)
    .where(eq(signers.clerkUserId, userId))
    .limit(1);
  return rows[0] ?? null;
}

export interface UpdateMyProfileInput {
  displayName: string;
  affiliation: string;
  locationText: string;
}

export async function updateMyProfileAction(
  input: UpdateMyProfileInput,
): Promise<{ success: boolean; error?: string }> {
  const me = await getMySigner();
  if (!me) return { success: false, error: "Not signed in." };
  const displayName = input.displayName.trim();
  if (!displayName) {
    return { success: false, error: "Display name is required." };
  }
  await getDb()
    .update(signers)
    .set({
      displayName,
      affiliation: input.affiliation.trim() || null,
      locationText: input.locationText.trim() || null,
    })
    .where(eq(signers.id, me.id));
  revalidatePath("/account");
  revalidatePath("/signers");
  revalidatePath(`/signatories/${me.id}`);
  return { success: true };
}

/**
 * Removes a single signature row of the viewer for a specific version.
 * Does NOT delete the signer profile or other versions they signed.
 */
export async function removeMySignatureForVersionAction(
  versionString: string,
): Promise<{ success: boolean; error?: string }> {
  const me = await getMySigner();
  if (!me) return { success: false, error: "Not signed in." };
  const db = getDb();
  const vRows = await db
    .select({ id: versions.id })
    .from(versions)
    .where(eq(versions.version, versionString))
    .limit(1);
  if (vRows.length === 0) {
    return { success: false, error: `Unknown version: ${versionString}` };
  }
  await db
    .delete(signatures)
    .where(
      and(
        eq(signatures.signerId, me.id),
        eq(signatures.versionId, vRows[0].id),
      ),
    );
  revalidatePath("/account");
  revalidatePath("/signers");
  revalidatePath(`/signatories/${me.id}`);
  revalidatePath(`/v/${versionString}`);
  return { success: true };
}
