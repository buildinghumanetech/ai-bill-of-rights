/**
 * "Why I signed" — the one-sentence statement a signer optionally writes after
 * their signature lands.
 *
 * The text is public: it renders into the signer's page, their OG share card,
 * and the default share copy. So the cap and the sanitising live HERE, on the
 * server side of the fence, and the client-side counter in SignModal is only a
 * courtesy. Anything that writes `signers.why_i_signed` must go through
 * `normalizeWhyISigned` first.
 */

import { eq } from "drizzle-orm";
import { signers } from "@/lib/db/schema";

/** Hard cap. Matches the counter shown in the sign modal. */
export const MAX_WHY_I_SIGNED_LENGTH = 200;

/**
 * Collapse whitespace, strip control characters, trim, and enforce the cap.
 *
 * Returns `null` for anything that isn't usable text (empty, whitespace-only,
 * non-string) so callers can store SQL NULL rather than an empty string — the
 * "no statement" branch everywhere downstream tests for null/empty.
 */
export function normalizeWhyISigned(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw
    // Control characters (including newlines) become spaces: this is a single
    // sentence rendered on one canvas, not a multi-paragraph field.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length === 0) return null;
  return cleaned.slice(0, MAX_WHY_I_SIGNED_LENGTH);
}

/**
 * True when the raw input exceeds the cap and would be silently shortened.
 * The server action uses this to tell the user their words were trimmed.
 */
export function exceedsWhyISignedCap(raw: unknown): boolean {
  if (typeof raw !== "string") return false;
  const cleaned = raw.replace(/\s+/g, " ").trim();
  return cleaned.length > MAX_WHY_I_SIGNED_LENGTH;
}

/**
 * Write the statement onto the signer row owned by `clerkUserId`.
 *
 * The `WHERE clerk_user_id = ...` is the ownership check: there is no signer-id
 * parameter, so a caller can never address someone else's row. Returns null
 * when the session has no signer record yet.
 */
export async function updateWhyISignedForClerkUser(
  db: any,
  clerkUserId: string,
  raw: unknown,
): Promise<{ signerId: string; whyISigned: string | null } | null> {
  const whyISigned = normalizeWhyISigned(raw);
  const rows = await db
    .update(signers)
    .set({ whyISigned })
    .where(eq(signers.clerkUserId, clerkUserId))
    .returning({ id: signers.id, whyISigned: signers.whyISigned });
  if (rows.length === 0) return null;
  return { signerId: rows[0].id, whyISigned: rows[0].whyISigned ?? null };
}
