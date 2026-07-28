/**
 * The /account link into the deletion flow has to describe the flow it opens.
 *
 * `submitRevokeAction` runs the full cascade in `src/server/signers/delete.ts`:
 * signatures, profile row, consent records, every comment, every proposed
 * edit, OTHER PEOPLE'S comments on those edits, votes, upvotes, endorsements,
 * and every photo blob. `/account/revoke` and the SignModal confirm dialog both
 * enumerate that. This link is how most account-holders reach it, and it used
 * to read "Remove all my signatures and delete my profile" — which names two
 * of the nine things it destroys and reads like a narrower action than it is.
 *
 * A source-text assertion rather than a render: AccountClient is a client
 * component behind Clerk, and what is being protected here is the wording, not
 * the markup.
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

describe("the /account entry point into the deletion cascade", () => {
  it("does not describe the cascade as only signatures and a profile", () => {
    expect(
      linkText.toLowerCase(),
      `The link reads "${linkText}". That understates it: the destination ` +
        `runs the full cascade, which also destroys every comment, every ` +
        `proposed edit, other people's comments on those edits, and all ` +
        `photo blobs.`,
    ).not.toBe("remove all my signatures and delete my profile →");
  });

  it("names the parts of the cascade a signer would not expect", () => {
    const lower = linkText.toLowerCase();
    for (const word of ["comment", "photo"]) {
      expect(
        lower,
        `The link reads "${linkText}" and never mentions "${word}", which ` +
          `the cascade destroys. Keep this label in step with the list on ` +
          `/account/revoke (src/app/account/revoke/page.tsx).`,
      ).toContain(word);
    }
  });
});
