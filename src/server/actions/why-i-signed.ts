"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import {
  exceedsWhyISignedCap,
  updateWhyISignedForClerkUser,
} from "@/lib/why-i-signed";

// Lazily resolve the production db so importing this module in tests does not
// trip the DATABASE_URL guard in src/lib/db/index.ts at module-eval time.
// (Same pattern as src/server/actions/profile.ts.)
let _db: any | null = null;
function getDb() {
  if (!_db) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _db = (require("@/lib/db") as { db: any }).db;
  }
  return _db;
}

export interface SaveWhyISignedResult {
  success: boolean;
  error?: string;
  /** What actually landed in the database, post-sanitising. */
  whyISigned?: string | null;
  /** True when the input was over the cap and got shortened. */
  truncated?: boolean;
}

/**
 * Set (or clear) the current signer's "why I signed" statement.
 *
 * Ownership: the row is addressed by the session's Clerk user id, never by an
 * id the client supplies — so this can only ever write the caller's own row.
 * Length and sanitising are enforced here rather than trusting the modal's
 * counter, because this text renders into a public OG image and a public page.
 *
 * Passing an empty string clears the statement.
 */
export async function saveWhyISigned(
  raw: string,
): Promise<SaveWhyISignedResult> {
  const { userId } = await auth();
  if (!userId) return { success: false, error: "Not signed in." };

  const truncated = exceedsWhyISignedCap(raw);

  try {
    const updated = await updateWhyISignedForClerkUser(getDb(), userId, raw);
    if (!updated) {
      return { success: false, error: "No signature on this account." };
    }
    revalidatePath(`/signatories/${updated.signerId}`);
    return { success: true, whyISigned: updated.whyISigned, truncated };
  } catch (err) {
    console.error("[why-i-signed] save failed:", err);
    return { success: false, error: "Couldn't save that. Please try again." };
  }
}
