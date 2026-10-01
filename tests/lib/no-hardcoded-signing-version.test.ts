import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Regression guard. After the v0.1.1 publish, SignModal still had
 * `const VERSION = "0.1.0"`, so every sign attempt hit recordSignature's
 * "no longer open for signing" check and NOBODY could sign.
 *
 * The signing path must take the current version from the DB, never a literal.
 * If you add a file to the signing path, add it here.
 */
const SIGNING_PATH_FILES = [
  "src/app/SignModal.tsx",
  "src/app/admin/signers/AdminAddSignerForm.tsx",
  "src/app/sign/consent/page.tsx",
  "src/app/sign/complete/page.tsx",
  "src/app/sign/profile/page.tsx",
  "src/server/actions/me.ts",
  "src/server/actions/profile.ts",
];

describe("signing path never hardcodes a version", () => {
  for (const file of SIGNING_PATH_FILES) {
    it(file, () => {
      const code = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      expect(code).not.toMatch(/["'`]\d+\.\d+\.\d+["'`]/);
    });
  }
});
