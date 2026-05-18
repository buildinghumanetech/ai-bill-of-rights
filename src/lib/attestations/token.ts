import { randomUUID } from "node:crypto";

/**
 * Generates an opaque, single-use verification token for attestation email
 * confirmation links. Stored on the `verification_token` column (UNIQUE).
 * Has no embedded claims — lookup-only.
 */
export function generateVerificationToken(): string {
  return randomUUID().replace(/-/g, "");
}
