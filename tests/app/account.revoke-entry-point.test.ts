/**
 * The /account link to /account/revoke has to describe what that page does.
 *
 * `submitRevokeAction` does NOT delete: it calls `anonymizeSigner`, which keeps
 * the signature (relabelled "Anonymized signer #N"), scrubs the private
 * capture fields and deletes photos — the behaviour content/consent/v1.md
 * promises for revoking. This link used to read "Delete my account —
 * signatures, comments, proposals and photos", describing the hard-delete
 * cascade, which lives behind "Delete my account" on the same page instead.
 *
 * A source-text assertion rather than a render: what is being protected here
 * is the wording, not the markup.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ACCOUNT_CLIENT = readFileSync(
  join(process.cwd(), "src/app/account/AccountClient.tsx"),
  "utf8",
);

/** The text of the anchor whose href is /account/revoke. */
const linkText = (() => {
  const at = ACCOUNT_CLIENT.indexOf('href="/account/revoke"');
  expect(at, "no link to /account/revoke in AccountClient").toBeGreaterThan(-1);
  const close = ACCOUNT_CLIENT.indexOf(">", at); // end of the <Link …> tag
  const end = ACCOUNT_CLIENT.indexOf("</Link>", close);
  const text = ACCOUNT_CLIENT.slice(close + 1, end).trim();
  expect(text.length, "could not read the link text").toBeGreaterThan(0);
  return text;
})();

describe("the /account entry point into revoking consent", () => {
  it("says it anonymizes and removes personal data", () => {
    const lower = linkText.toLowerCase();
    expect(lower).toContain("revoke");
    expect(lower).toContain("anonymize");
    expect(lower).toContain("personal data");
  });

  it("does not claim to delete the account", () => {
    // Revoking keeps the signature and the account row; calling it a delete
    // sends people looking for the hard delete to the wrong page, and the
    // other way round.
    expect(linkText.toLowerCase()).not.toContain("delete");
  });
});
