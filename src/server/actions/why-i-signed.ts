"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { exceedsWhyISignedCap } from "@/lib/why-i-signed";
import { saveWhyISignedForClerkUser } from "@/lib/why-i-signed.server";
import { getDb } from "@/lib/db/lazy";

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
 * Passing an empty string clears the statement — that is the "remove" path the
 * account page uses, so a signer who regrets their words can take them down
 * without needing anyone's help. That path is deliberately exempt from the edit
 * rate limit (see `saveWhyISignedForClerkUser`): "without needing anyone's help"
 * has to include "and without waiting an hour".
 */
export async function saveWhyISigned(
  raw: string,
): Promise<SaveWhyISignedResult> {
  const { userId } = await auth();
  if (!userId) return { success: false, error: "Not signed in." };

  const truncated = exceedsWhyISignedCap(raw);

  try {
    const outcome = await saveWhyISignedForClerkUser(getDb(), userId, raw);
    if (!outcome.ok) return { success: false, error: outcome.error };
    revalidatePath(`/signatories/${outcome.signerId}`);
    revalidatePath("/account");
    return { success: true, whyISigned: outcome.whyISigned, truncated };
  } catch (err) {
    console.error("[why-i-signed] save failed:", err);
    return { success: false, error: "Couldn't save that. Please try again." };
  }
}
