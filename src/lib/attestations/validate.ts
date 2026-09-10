import { EMAIL_RE } from "@/lib/validation/input";

const MAX_TEXT = 200;
const MAX_URL = 500;

/**
 * Pure server-side validation for the (anonymous, un-authenticated) attestation
 * form. Client maxLength/type attributes are bypassable, so we re-check here.
 * Returns an error message, or null when the fields are acceptable.
 *
 * Lives outside the `"use server"` actions module so it can stay a plain
 * (synchronous) function — `"use server"` files may only export async actions —
 * and so it's unit-testable without a request/db.
 */
export function validateAttestationFields(input: {
  orgName: string;
  productName: string;
  productUrl: string | null;
  contactEmail: string;
}): string | null {
  if (
    input.orgName.length === 0 ||
    input.productName.length === 0 ||
    input.contactEmail.length === 0
  ) {
    return "orgName, productName, and contactEmail are required";
  }
  if (
    input.orgName.length > MAX_TEXT ||
    input.productName.length > MAX_TEXT ||
    input.contactEmail.length > MAX_TEXT
  ) {
    return "One or more fields is too long.";
  }
  if (!EMAIL_RE.test(input.contactEmail)) {
    return "A valid contact email is required.";
  }
  if (input.productUrl) {
    if (input.productUrl.length > MAX_URL) {
      return "Product URL is too long.";
    }
    // Require an http(s) URL so the public attestations page links to a real,
    // navigable product page (data quality — a malformed or non-web link is
    // useless to a reader).
    if (!/^https?:\/\//i.test(input.productUrl)) {
      return "Product URL must start with http:// or https://.";
    }
  }
  return null;
}
