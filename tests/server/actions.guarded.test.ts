/**
 * Every export of a `"use server"` module is a public POST endpoint.
 *
 * Next 16's own docs (node_modules/next/dist/docs/01-app/01-getting-started/
 * 07-mutating-data.md) say it twice: a `"use server"` directive at the top of
 * a file marks ALL exports of that file as Server Functions, and "Server
 * Functions are reachable via direct POST requests, not just through your
 * application's UI. Always verify authentication and authorization inside
 * every Server Function."
 *
 * This repo broke that rule in bulk. Each action file exported an
 * authenticated `*Action` wrapper AND the raw core function it wrapped, so the
 * core functions were live unauthenticated RPC. The worst was `deleteSigner`,
 * whose only argument that matters is a signer id — and signer ids are public
 * by design (the `?ref=` in every share link, the path segment of every
 * `/signatories/<id>` page). A POST of `[null, "<signer-uuid>"]` ran the full
 * irreversible deletion cascade against production.
 *
 * The fix was to move every core function into a plain, non-`"use server"`
 * module so it is unreachable from a browser. This test is what keeps it
 * fixed: it parses each action file's exports and fails, naming the export, if
 * any of them can be reached without an auth check.
 *
 * IF THIS TEST IS FAILING ON YOUR NEW EXPORT, the fix is almost never to add
 * an entry to PUBLIC_BY_DESIGN. It is to move the function into a plain module
 * under src/server/<domain>/ and export only an authenticated wrapper from
 * src/server/actions/.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ACTIONS_DIR = join(process.cwd(), "src/server/actions");

/**
 * Calls that actually establish who the caller is. `auth()` is Clerk's session
 * read; `getCurrentAdmin()` (src/lib/admin/check.ts) resolves the session to a
 * signer row and its admin flag. Everything else counts only by reaching one
 * of these — see `isGuarded`.
 */
const ROOT_GUARDS = [/\bauth\s*\(/, /\bgetCurrentAdmin\s*\(/];

/**
 * Exports that are unauthenticated ON PURPOSE. Each needs a reason that
 * survives a hostile reading: not "the UI only calls it when signed in" (the
 * UI is not the only caller) but "there is no session to check, and reaching
 * this without one causes no harm".
 */
const PUBLIC_BY_DESIGN: Record<string, string> = {
  "contact.ts:sendContactMessageAction":
    "The /about contact form. It is open to visitors who have no account at " +
    "all, so there is no session to verify. It writes nothing to the " +
    "database — it sends one email to a fixed internal address, with " +
    "length caps on every field.",
  "attestations.ts:submitAttestationAction":
    "The public 'our product complies' form on /attestations. Organisations " +
    "filling it in are not signers and have no account. Submitting publishes " +
    "nothing: it mints an unguessable verification token, emails it, and only " +
    "clicking that link publishes the claim. The token is the credential.",
};

interface TopLevelDecl {
  name: string;
  exported: boolean;
  body: string;
}

/**
 * Split a module into its top-level function/const declarations.
 *
 * Deliberately a source-text parse rather than a TypeScript AST walk: the
 * point is to be blunt and unmissable, and every file in this directory is
 * Prettier-formatted with top-level declarations starting at column 0. A
 * declaration's "body" is everything from its own start to the start of the
 * next one, which over-reads slightly and can only ever make the check more
 * permissive at the boundary — never less.
 */
function parseTopLevelDecls(source: string): TopLevelDecl[] {
  const patterns = [
    // function foo(...) / export async function foo(...)
    /^(export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)/gm,
    // const foo = async (...) => / export const foo = function ...
    /^(export\s+)?(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*(?::[^=\n]*)?=\s*(?:async\s*)?(?:\(|function\b)/gm,
  ];

  const starts: { index: number; name: string; exported: boolean }[] = [];
  for (const re of patterns) {
    for (const m of source.matchAll(re)) {
      starts.push({
        index: m.index!,
        name: m[2],
        exported: Boolean(m[1]),
      });
    }
  }
  starts.sort((a, b) => a.index - b.index);

  return starts.map((s, i) => ({
    name: s.name,
    exported: s.exported,
    body: source.slice(s.index, starts[i + 1]?.index ?? source.length),
  }));
}

/**
 * True when `name`'s body performs a root guard, or calls a local helper in
 * the same file that (transitively) does. That indirection is load-bearing:
 * the admin wrappers guard via `requireAdminOrBootstrap()` / `requireAdminId()`
 * and the account ones via `getMySigner()`, and this resolves through them
 * rather than accepting the mere presence of a helper-shaped name.
 */
function isGuarded(
  name: string,
  decls: Map<string, TopLevelDecl>,
  seen = new Set<string>(),
): boolean {
  if (seen.has(name)) return false; // cycle — no guard found along this path
  seen.add(name);
  const decl = decls.get(name);
  if (!decl) return false;
  if (ROOT_GUARDS.some((re) => re.test(decl.body))) return true;
  for (const other of decls.keys()) {
    if (other === name) continue;
    if (!new RegExp(`\\b${other}\\s*\\(`).test(decl.body)) continue;
    if (isGuarded(other, decls, seen)) return true;
  }
  return false;
}

const actionFiles = readdirSync(ACTIONS_DIR)
  .filter((f) => f.endsWith(".ts"))
  .sort();

describe("src/server/actions/*.ts — every export is a public POST endpoint", () => {
  it("finds the action files (guards against a silently-empty sweep)", () => {
    expect(actionFiles.length).toBeGreaterThan(10);
  });

  it.each(actionFiles)("%s starts with \"use server\"", (file) => {
    // If this ever stops holding, the file is not a Server Function module and
    // the rest of this suite is checking the wrong thing.
    const source = readFileSync(join(ACTIONS_DIR, file), "utf8");
    expect(source.trimStart().startsWith('"use server"')).toBe(true);
  });

  it.each(actionFiles)("%s exports nothing unauthenticated", (file) => {
    const source = readFileSync(join(ACTIONS_DIR, file), "utf8");
    const decls = parseTopLevelDecls(source);
    const byName = new Map(decls.map((d) => [d.name, d]));

    const unguarded = decls
      .filter((d) => d.exported)
      .filter((d) => !PUBLIC_BY_DESIGN[`${file}:${d.name}`])
      .filter((d) => !isGuarded(d.name, byName))
      .map((d) => d.name);

    expect(
      unguarded,
      unguarded.length === 0
        ? ""
        : `src/server/actions/${file} exports ${unguarded
            .map((n) => `\`${n}\``)
            .join(", ")} with no auth check reachable from its body. ` +
            `Everything exported from a "use server" file can be POSTed to ` +
            `directly, without going near the UI. Move the core logic to a ` +
            `plain module under src/server/<domain>/ and export only an ` +
            `authenticated wrapper from here — or, if it is genuinely meant ` +
            `to be public, add it to PUBLIC_BY_DESIGN in this test with a ` +
            `justification.`,
    ).toEqual([]);
  });

  it("keeps the allowlist honest — every entry names a real export", () => {
    for (const key of Object.keys(PUBLIC_BY_DESIGN)) {
      const [file, name] = key.split(":");
      expect(actionFiles, `allowlist names missing file ${file}`).toContain(
        file,
      );
      const source = readFileSync(join(ACTIONS_DIR, file), "utf8");
      const exported = parseTopLevelDecls(source)
        .filter((d) => d.exported)
        .map((d) => d.name);
      expect(exported, `allowlist names missing export ${key}`).toContain(name);
      expect(PUBLIC_BY_DESIGN[key].length).toBeGreaterThan(80);
    }
  });
});

describe("the specific functions this bug class was found on stay out of reach", () => {
  // Named individually because a regression here is not "a new export slipped
  // through" but "someone moved a known-dangerous function back". These take
  // an id or a caller identity as an argument and check neither.
  const MUST_NOT_BE_ACTION_EXPORTS = [
    "deleteSigner",
    "upsertSignerProfile",
    "recordSignature",
    "createComment",
    "deleteComment",
    "editComment",
    "voteOnComment",
    "reportComment",
    "toggleReportComment",
    "toggleCommentUpvote",
    "submitSelfie",
    "approveSelfie",
    "rejectSelfie",
    "reportSelfie",
    "resolveSelfieReports",
    "removeMySelfie",
    "createAttestation",
    "verifyAttestationToken",
    "approveAttestation",
    "hideAttestation",
    "insertNonSigner",
  ];

  const allExports = new Map<string, string>(); // export name -> file
  for (const file of actionFiles) {
    const source = readFileSync(join(ACTIONS_DIR, file), "utf8");
    for (const d of parseTopLevelDecls(source)) {
      if (d.exported) allExports.set(d.name, file);
    }
  }

  it.each(MUST_NOT_BE_ACTION_EXPORTS)(
    "%s is not exported from any src/server/actions file",
    (name) => {
      expect(
        allExports.get(name) ?? null,
        `\`${name}\` is exported from src/server/actions/${allExports.get(
          name,
        )} again. It takes the id (or the caller identity) it operates on as a ` +
          `plain argument and verifies neither, so exporting it from a ` +
          `"use server" module makes it callable by anyone with a POST.`,
      ).toBeNull();
    },
  );
});
