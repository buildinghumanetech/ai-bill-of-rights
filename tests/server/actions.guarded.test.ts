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
 * fixed.
 *
 * IF THIS TEST IS FAILING ON YOUR NEW EXPORT, the fix is almost never to add
 * an entry to PUBLIC_BY_DESIGN. It is to move the function into a plain module
 * under src/server/<domain>/ and export only an authenticated wrapper from
 * src/server/actions/.
 *
 * WHY IT LOOKS THE WAY IT DOES. The first version of this test pinned its
 * sweep to `src/server/actions/` and recognised exactly two export forms, and
 * a review found four ways straight past it. Each of the four is now a named
 * test, and each has been mutation-verified — the file is only worth its
 * length if it goes RED on the mutation it claims to catch:
 *
 *   1. SCOPE. The invariant is "no `"use server"` file exports anything
 *      unauthenticated", which is repo-wide; the sweep was one directory. Add
 *      `"use server"` to `src/server/signers/delete.ts` — one line — and every
 *      hole the refactor closed reopens with a green suite. The sweep now
 *      globs all of `src/`, selects files by their directive prologue, and is
 *      backed by the cheaper companion assertion: no module under
 *      `src/server/<domain>/` may carry the directive at all.
 *
 *   2. EXPORT FORMS. `export { deleteSigner } from "@/server/signers/delete"`
 *      restores the original vulnerability exactly, and is the single most
 *      likely way a future developer "fixes" a broken import after this
 *      refactor. So do `export * from`, `export default`, and
 *      `export const raw = deleteSigner` (an alias — no `(` after the `=`).
 *      All four were invisible to the old parser. Re-exports now fail
 *      outright: a re-export forwards a binding verbatim, so it can never
 *      carry an auth check, and there is no "guarded" verdict available to it.
 *
 *   3. FALSE "GUARDED" VERDICTS. A declaration's body used to run to the START
 *      of the next declaration, so it swallowed the next declaration's leading
 *      doc comment — and this repo's own convention is docstrings that say
 *      "auth()" in prose directly above the function they describe. An
 *      unguarded export followed by such a docstring reported as guarded.
 *      Comments and string literals are now stripped before anything is
 *      matched, and a body ends at its own closing brace.
 *
 *   4. UNCHECKED READS. `await auth()` on its own establishes nothing —
 *      `userId` is `null` for an anonymous caller and the call succeeds. A
 *      guard now only counts if the value it binds is actually rejected
 *      afterwards (`if (!userId) …`, `if (ctx.state !== "admin") …`).
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = process.cwd();
const SRC_DIR = join(ROOT, "src");
const ACTIONS_DIR_REL = "src/server/actions";

/**
 * Calls that actually establish who the caller is. `auth()` is Clerk's session
 * read; `getCurrentAdmin()` (src/lib/admin/check.ts) resolves the session to a
 * signer row and its admin flag. Everything else counts only by reaching one
 * of these — see `isGuarded`.
 */
const GUARD_CALLS = ["auth", "getCurrentAdmin"];

/**
 * Exports that are unauthenticated ON PURPOSE. Keyed by repo-relative path so
 * the allowlist cannot silently apply to a same-named file in another
 * directory. Each needs a reason that survives a hostile reading: not "the UI
 * only calls it when signed in" (the UI is not the only caller) but "there is
 * no session to check, and reaching this without one causes no harm".
 */
const PUBLIC_BY_DESIGN: Record<string, string> = {
  "src/server/actions/contact.ts:sendContactMessageAction":
    "The /about contact form. It is open to visitors who have no account at " +
    "all, so there is no session to verify. It writes nothing to the " +
    "database — it sends one email to a fixed internal address, with " +
    "length caps on every field.",
  "src/server/actions/attestations.ts:submitAttestationAction":
    "The public 'our product complies' form on /attestations. Organisations " +
    "filling it in are not signers and have no account. Submitting publishes " +
    "nothing directly: it mints an unguessable verification token and emails " +
    "it. The token is the credential, and it authorises ANY request that " +
    "carries it — including an automated one, since /attestations/verify/" +
    "[token] publishes during render of a GET.",
};

// =====================================================================
// Source stripping
// =====================================================================

/**
 * Blank out comments and string/template/regex literal contents, preserving
 * every character offset and every newline.
 *
 * Two outputs, because they answer different questions:
 *
 *  - `noComments` keeps literals. It is what the directive-prologue check and
 *    the import scan read, since `"use server"` IS a string literal.
 *  - `code` blanks them too. It is what every declaration parse, body slice
 *    and guard match reads, so that no prose in a docstring and no text in a
 *    string can ever be mistaken for code. Item 3 in the header — a docstring
 *    containing the words "auth()" marking the export above it as guarded —
 *    is exactly this failure.
 *
 * Braces stay balanced in `code`: the `${` and closing `}` of a template
 * interpolation are blanked, while the expression between them is kept, so
 * brace matching over `code` sees only real block braces.
 */
function stripSource(src: string): { noComments: string; code: string } {
  const withLiterals: string[] = [];
  const withoutLiterals: string[] = [];
  const blank = (ch: string) => (ch === "\n" ? "\n" : " ");
  const emit = (ch: string, keepInFirst: boolean, keepInSecond: boolean) => {
    withLiterals.push(keepInFirst ? ch : blank(ch));
    withoutLiterals.push(keepInSecond ? ch : blank(ch));
  };

  // A `/` starts a regex literal only after one of these. Deliberately
  // excludes `<` and `>` so that JSX (`</div>`, `<br />`) is never mistaken
  // for one.
  const REGEX_MAY_FOLLOW = new Set("(,=:[!&|?{};+-*%^~".split(""));

  // Mode stack: "code" frames may be the module itself or the inside of a
  // `${...}`; "tmpl" frames are template-literal text.
  const modes: ("code" | "tmpl")[] = ["code"];
  const braceDepth: number[] = [0];
  let lastCodeChar = "";
  let i = 0;

  while (i < src.length) {
    const ch = src[i];

    if (modes[modes.length - 1] === "tmpl") {
      if (ch === "\\") {
        emit(ch, true, false);
        i++;
        if (i < src.length) {
          emit(src[i], true, false);
          i++;
        }
        continue;
      }
      if (ch === "`") {
        emit(ch, true, false);
        i++;
        modes.pop();
        lastCodeChar = "`";
        continue;
      }
      if (ch === "$" && src[i + 1] === "{") {
        emit(ch, true, false);
        i++;
        emit(src[i], true, false);
        i++;
        modes.push("code");
        braceDepth.push(0);
        lastCodeChar = "";
        continue;
      }
      emit(ch, true, false);
      i++;
      continue;
    }

    // ---- code mode ----
    if (ch === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") {
        emit(src[i], false, false);
        i++;
      }
      continue;
    }
    if (ch === "/" && src[i + 1] === "*") {
      emit(src[i], false, false);
      i++;
      emit(src[i], false, false);
      i++;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) {
        emit(src[i], false, false);
        i++;
      }
      if (i < src.length) {
        emit(src[i], false, false);
        i++;
        emit(src[i], false, false);
        i++;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      const quote = ch;
      emit(ch, true, false);
      i++;
      while (i < src.length && src[i] !== quote && src[i] !== "\n") {
        if (src[i] === "\\") {
          emit(src[i], true, false);
          i++;
          if (i < src.length) {
            emit(src[i], true, false);
            i++;
          }
          continue;
        }
        emit(src[i], true, false);
        i++;
      }
      if (i < src.length && src[i] === quote) {
        emit(src[i], true, false);
        i++;
      }
      lastCodeChar = quote;
      continue;
    }
    if (ch === "`") {
      emit(ch, true, false);
      i++;
      modes.push("tmpl");
      continue;
    }
    if (ch === "/" && (lastCodeChar === "" || REGEX_MAY_FOLLOW.has(lastCodeChar))) {
      emit(ch, true, false);
      i++;
      let inCharClass = false;
      while (i < src.length && src[i] !== "\n") {
        if (src[i] === "\\") {
          emit(src[i], true, false);
          i++;
          if (i < src.length) {
            emit(src[i], true, false);
            i++;
          }
          continue;
        }
        if (src[i] === "[") inCharClass = true;
        else if (src[i] === "]") inCharClass = false;
        else if (src[i] === "/" && !inCharClass) {
          emit(src[i], true, false);
          i++;
          break;
        }
        emit(src[i], true, false);
        i++;
      }
      while (i < src.length && /[a-z]/.test(src[i])) {
        emit(src[i], true, false);
        i++;
      }
      lastCodeChar = "/";
      continue;
    }
    if (ch === "{") {
      braceDepth[braceDepth.length - 1]++;
      emit(ch, true, true);
      i++;
      lastCodeChar = "{";
      continue;
    }
    if (ch === "}") {
      if (braceDepth[braceDepth.length - 1] === 0 && modes.length > 1) {
        // closes a `${...}` — blank it so brace matching stays balanced
        emit(ch, true, false);
        i++;
        modes.pop();
        braceDepth.pop();
        lastCodeChar = "}";
        continue;
      }
      braceDepth[braceDepth.length - 1] = Math.max(
        0,
        braceDepth[braceDepth.length - 1] - 1,
      );
      emit(ch, true, true);
      i++;
      lastCodeChar = "}";
      continue;
    }
    emit(ch, true, true);
    if (!/\s/.test(ch)) lastCodeChar = ch;
    i++;
  }

  return {
    noComments: withLiterals.join(""),
    code: withoutLiterals.join(""),
  };
}

// =====================================================================
// Declaration parsing
// =====================================================================

interface TopLevelDecl {
  name: string;
  exported: boolean;
  body: string;
  /** Offsets into the file, so inline directives can be attributed. */
  start: number;
  end: number;
}

/** Index of the `}` closing the `{` at `open`, or -1. Braces in `code` are all structural. */
function matchBrace(code: string, open: number): number {
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    if (code[i] === "{") depth++;
    else if (code[i] === "}" && --depth === 0) return i;
  }
  return -1;
}

/**
 * Characters that can follow a `}` only when the braces closed a TYPE or a
 * sub-expression rather than the declaration's body — `Promise<{ … }>`,
 * `(input: { … }) => …`, `{ … } | { … }`.
 */
const BRACE_IS_NOT_THE_BODY = new Set(">|&,)]=:?".split(""));

/**
 * Where a top-level declaration ends.
 *
 * Statement form (`export const raw = deleteSigner;`) ends at its semicolon.
 * Block form ends at its OWN closing brace, brace-matched — not at the start
 * of the next declaration, which is what used to make a body swallow the doc
 * comment that follows it (header item 3).
 *
 * Brace-matching has to skip the braces of inline types: this repo writes
 * `): Promise<{ ok: boolean }> {` across several lines, so the return type's
 * closing `}>` lands at column 0 and a naive "first unindented `}`" ends the
 * body before it starts. Each balanced group is therefore tested by what
 * follows it, and only a group followed by something that cannot continue a
 * type is taken as the body. `limit` (the next declaration's start) is only a
 * backstop for shapes this does not understand.
 */
function declEnd(code: string, start: number, limit: number): number {
  const brace = code.indexOf("{", start);
  const semi = code.indexOf(";", start);
  if (semi !== -1 && semi < limit && (brace === -1 || semi < brace)) {
    return semi + 1;
  }
  let cursor = start;
  for (;;) {
    const open = code.indexOf("{", cursor);
    if (open === -1 || open >= limit) return limit;
    const close = matchBrace(code, open);
    if (close === -1) return limit;
    let j = close + 1;
    while (j < code.length && /\s/.test(code[j])) j++;
    if (!BRACE_IS_NOT_THE_BODY.has(code[j] ?? "")) {
      return Math.min(close + 1, limit);
    }
    cursor = close + 1;
  }
}

/**
 * Split a module into its top-level declarations.
 *
 * Deliberately a source-text parse rather than a TypeScript AST walk: the
 * point is to be blunt and unmissable. It runs on comment- and string-stripped
 * source, so nothing in prose or in a literal can be read as a declaration.
 *
 * `export const foo = <anything>` is matched whatever the right-hand side is,
 * not only arrows and function expressions — `export const raw = deleteSigner`
 * is a live Server Function too, and an alias is the quietest way to re-expose
 * one. Non-function values are caught by the same widening, which is correct:
 * Next rejects a non-async export from a `"use server"` file outright, so
 * there is no legitimate case to spare.
 */
function parseTopLevelDecls(code: string): TopLevelDecl[] {
  const patterns: { re: RegExp; name?: string }[] = [
    // function foo(...) / export async function foo(...)
    { re: /^(export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)/gm },
    // const foo = <anything> / export let foo: T = <anything>
    { re: /^(export\s+)?(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*(?::[^=\n]*)?=/gm },
    // export default ... (function, arrow, or a bare identifier alias)
    { re: /^(export\s+)default\b/gm, name: "default" },
  ];

  const starts: { index: number; name: string; exported: boolean }[] = [];
  for (const { re, name } of patterns) {
    for (const m of code.matchAll(re)) {
      starts.push({
        index: m.index!,
        name: name ?? m[2],
        exported: Boolean(m[1]),
      });
    }
  }
  starts.sort((a, b) => a.index - b.index);

  return starts.map((s, i) => {
    const limit = starts[i + 1]?.index ?? code.length;
    const end = declEnd(code, s.index, limit);
    return {
      name: s.name,
      exported: s.exported,
      body: code.slice(s.index, end),
      start: s.index,
      end,
    };
  });
}

// =====================================================================
// Guard detection
// =====================================================================

const GUARD_BINDING = new RegExp(
  `(?:const|let|var)\\s+(\\{[^}]*\\}|[A-Za-z0-9_$]+)\\s*=\\s*await\\s+(?:${GUARD_CALLS.join(
    "|",
  )})\\s*\\(`,
  "g",
);

/** Local names a destructuring or plain binding introduces. */
function boundNames(binding: string): string[] {
  if (!binding.startsWith("{")) return [binding];
  return binding
    .slice(1, -1)
    .split(",")
    .map((part) => {
      const t = part.trim();
      if (!t) return "";
      const halves = t.split(":");
      return (halves[1] ?? halves[0]).trim().replace(/=.*$/, "").trim();
    })
    .filter(Boolean);
}

/**
 * Whether `rest` actually rejects on `name`. `await auth()` establishes
 * nothing on its own — for an anonymous caller it resolves with a null
 * `userId` and execution carries straight on. What makes it a guard is the
 * line after it.
 */
function rejectsOn(rest: string, name: string): boolean {
  const n = name.replace(/\$/g, "\\$");
  return (
    // if (!userId) ...
    new RegExp(`!\\s*${n}\\b`).test(rest) ||
    // if (ctx.state !== "admin") ...
    new RegExp(
      `\\b${n}(?:\\s*\\??\\.\\s*[A-Za-z0-9_$]+)*\\s*(?:===|!==|==|!=)`,
    ).test(rest) ||
    // userId ?? ... / userId && ... / userId || ...
    new RegExp(`\\b${n}\\s*(?:\\?\\?|&&|\\|\\|)`).test(rest)
  );
}

/** True when this body reads a session AND rejects on what it read. */
function hasRootGuard(body: string): boolean {
  for (const m of body.matchAll(GUARD_BINDING)) {
    const rest = body.slice(m.index! + m[0].length);
    if (boundNames(m[1]).some((n) => rejectsOn(rest, n))) return true;
  }
  return false;
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
  if (hasRootGuard(decl.body)) return true;
  for (const other of decls.keys()) {
    if (other === name) continue;
    if (!new RegExp(`\\b${other.replace(/\$/g, "\\$")}\\s*\\(`).test(decl.body)) {
      continue;
    }
    if (isGuarded(other, decls, seen)) return true;
  }
  return false;
}

// =====================================================================
// The sweep
// =====================================================================

interface Analysis {
  path: string; // repo-relative, posix separators
  source: string;
  noComments: string;
  code: string;
  /** The file's directive prologue is `"use server"` — every export is a Server Function. */
  isServerModule: boolean;
  decls: TopLevelDecl[];
  byName: Map<string, TopLevelDecl>;
  /** Names reachable from outside: `export function`, `export const`, and `export { … }`. */
  exported: { exportedAs: string; local: string }[];
  /** Offending `export … from` / `export *` lines — these can never carry a guard. */
  reExports: string[];
  /** Local binding name -> module specifier it was imported from. */
  imports: Map<string, string>;
}

function walkSource(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkSource(abs, out);
      continue;
    }
    if (/\.tsx?$/.test(entry.name)) out.push(abs);
  }
  return out;
}

const repoPath = (abs: string) => relative(ROOT, abs).split(sep).join("/");

const ALL_SOURCE_FILES = walkSource(SRC_DIR).sort();

function analyse(abs: string): Analysis {
  const source = readFileSync(abs, "utf8");
  const { noComments, code } = stripSource(source);
  const decls = parseTopLevelDecls(code);

  const exported: { exportedAs: string; local: string }[] = decls
    .filter((d) => d.exported)
    .map((d) => ({ exportedAs: d.name, local: d.name }));

  // `export { a, b as c };` — a local export list, no `from`.
  for (const m of noComments.matchAll(/^export\s*\{([^}]*)\}\s*;?[^\S\n]*$/gm)) {
    for (const part of m[1].split(",")) {
      const t = part.trim();
      if (!t) continue;
      const [local, as] = t.split(/\s+as\s+/).map((s) => s.trim());
      exported.push({ exportedAs: as ?? local, local });
    }
  }

  const reExports: string[] = [];
  for (const m of noComments.matchAll(/^export\s*(?:\*|\{[^}]*\})[^\n]*$/gm)) {
    if (/\bfrom\b/.test(m[0]) || m[0].trimStart().startsWith("export *")) {
      reExports.push(m[0].trim());
    }
  }

  const imports = new Map<string, string>();
  for (const m of noComments.matchAll(
    /^import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*["']([^"']+)["']/gm,
  )) {
    for (const part of m[1].split(",")) {
      const t = part.trim();
      if (!t) continue;
      const [, as] = t.split(/\s+as\s+/).map((s) => s.trim());
      imports.set((as ?? t).replace(/^type\s+/, ""), m[2]);
    }
  }

  return {
    path: repoPath(abs),
    source,
    noComments,
    code,
    isServerModule: /^\s*["']use server["']/.test(noComments),
    decls,
    byName: new Map(decls.map((d) => [d.name, d])),
    exported,
    reExports,
    imports,
  };
}

/**
 * Only files that could possibly matter get parsed: anything mentioning the
 * directive at all, plus every plain module under `src/server/` (which must be
 * checked precisely BECAUSE it does not mention it).
 */
const CANDIDATES = ALL_SOURCE_FILES.filter((abs) => {
  const rel = repoPath(abs);
  return (
    rel.startsWith("src/server/") || readFileSync(abs, "utf8").includes("use server")
  );
}).map(analyse);

const SERVER_MODULES = CANDIDATES.filter((a) => a.isServerModule);

/** Plain data-layer modules: under src/server/, but NOT src/server/actions/. */
const PLAIN_SERVER_MODULES = CANDIDATES.filter(
  (a) => a.path.startsWith("src/server/") && !a.path.startsWith(ACTIONS_DIR_REL + "/"),
);

const byPath = new Map(CANDIDATES.map((a) => [a.path, a]));

function specifierToPath(spec: string): string | null {
  if (!spec.startsWith("@/")) return null;
  const base = "src/" + spec.slice(2);
  for (const ext of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    if (byPath.has(base + ext)) return base + ext;
  }
  return null;
}

type Verdict = "guarded" | "public-by-design" | "unguarded";

function verdictFor(file: Analysis, local: string): Verdict {
  const exportedAs =
    file.exported.find((e) => e.local === local)?.exportedAs ?? local;
  if (PUBLIC_BY_DESIGN[`${file.path}:${exportedAs}`]) return "public-by-design";
  return isGuarded(local, file.byName) ? "guarded" : "unguarded";
}

// =====================================================================
// Tests
// =====================================================================

describe('every "use server" module in src/ — each export is a public POST endpoint', () => {
  it("finds the server modules (guards against a silently-empty sweep)", () => {
    expect(ALL_SOURCE_FILES.length).toBeGreaterThan(50);
    expect(SERVER_MODULES.length).toBeGreaterThan(10);
    // Named so that renaming or moving the actions directory cannot quietly
    // empty the sweep the way a bare count could.
    expect(SERVER_MODULES.map((a) => a.path)).toContain(
      "src/server/actions/revoke.ts",
    );
    expect(SERVER_MODULES.map((a) => a.path)).toContain(
      "src/server/actions/admin.ts",
    );
  });

  it.each(SERVER_MODULES.map((a) => a.path))(
    "%s re-exports nothing",
    (path) => {
      const file = byPath.get(path)!;
      expect(
        file.reExports,
        file.reExports.length === 0
          ? ""
          : `${path} re-exports ${file.reExports.join(" / ")}. A re-export ` +
              `forwards a binding verbatim, so it CANNOT carry an auth check ` +
              `— and everything exported from a "use server" file is a ` +
              `POST-reachable Server Function. This is how the original ` +
              `\`deleteSigner\` hole comes back: one line "fixing" an import. ` +
              `Import the function and call it from an authenticated wrapper ` +
              `instead.`,
      ).toEqual([]);
    },
  );

  it.each(SERVER_MODULES.map((a) => a.path))(
    "%s exports nothing unauthenticated",
    (path) => {
      const file = byPath.get(path)!;

      const unguarded = file.exported
        .filter((e) => verdictFor(file, e.local) === "unguarded")
        .map((e) => e.exportedAs);

      expect(
        unguarded,
        unguarded.length === 0
          ? ""
          : `${path} exports ${unguarded
              .map((n) => `\`${n}\``)
              .join(", ")} with no auth check reachable from its body. ` +
              `Everything exported from a "use server" file can be POSTed to ` +
              `directly, without going near the UI. Move the core logic to a ` +
              `plain module under src/server/<domain>/ and export only an ` +
              `authenticated wrapper from here — or, if it is genuinely meant ` +
              `to be public, add it to PUBLIC_BY_DESIGN in this test with a ` +
              `justification. Note that \`await auth()\` alone is not a ` +
              `guard: an anonymous caller gets a null userId and carries on. ` +
              `Reject on it.`,
      ).toEqual([]);
    },
  );

  it("keeps the allowlist honest — every entry names a real export", () => {
    for (const key of Object.keys(PUBLIC_BY_DESIGN)) {
      const idx = key.lastIndexOf(":");
      const path = key.slice(0, idx);
      const name = key.slice(idx + 1);
      const file = byPath.get(path);
      expect(file, `allowlist names missing file ${path}`).toBeDefined();
      expect(
        file!.isServerModule,
        `allowlist entry ${key} names a file that is not a "use server" module`,
      ).toBe(true);
      expect(
        file!.exported.map((e) => e.exportedAs),
        `allowlist names missing export ${key}`,
      ).toContain(name);
      expect(PUBLIC_BY_DESIGN[key].length).toBeGreaterThan(80);
    }
  });
});

describe("plain data-layer modules stay plain", () => {
  // The cheapest and most valuable guard in this file. The whole refactor is
  // "the core functions live somewhere a POST cannot reach"; adding one
  // `"use server"` line to any of these undoes all of it at once, and every
  // function in them takes the id or the caller identity it operates on as a
  // plain argument and verifies neither.
  it("finds the plain modules (guards against a silently-empty sweep)", () => {
    expect(PLAIN_SERVER_MODULES.length).toBeGreaterThan(5);
    expect(PLAIN_SERVER_MODULES.map((a) => a.path)).toContain(
      "src/server/signers/delete.ts",
    );
  });

  it.each(PLAIN_SERVER_MODULES.map((a) => a.path))(
    '%s does not carry a "use server" directive',
    (path) => {
      const file = byPath.get(path)!;
      // The docstrings in these modules talk ABOUT the directive, so this has
      // to read comment-stripped source — `noComments` keeps string literals
      // (a real directive) and drops prose (a mention of one).
      const stripped = file.noComments.replace(/\/\*[\s\S]*?\*\//g, "");
      const directives = [...stripped.matchAll(/["']use server["']/g)];
      expect(
        directives.length,
        directives.length === 0
          ? ""
          : `${path} carries a "use server" directive. Every export of a ` +
              `"use server" file is a POST-reachable Server Function, and the ` +
              `functions in this module take the signer id (or the caller ` +
              `identity) they act on as a plain argument and verify neither. ` +
              `One directive here re-opens every hole the src/server/actions ` +
              `refactor closed. Put the directive on a wrapper in ` +
              `src/server/actions/ that authenticates first.`,
      ).toBe(0);
    },
  );

  it.each(PLAIN_SERVER_MODULES.map((a) => a.path))(
    "%s takes db as a required argument, never an optional one",
    (path) => {
      const file = byPath.get(path)!;
      // `deleteSigner(dbClient: any = null, signerId)` resolved the PRODUCTION
      // client when the caller passed null — which is exactly what made
      // `deleteSigner(null, "<public-signer-id>")` a working POST while these
      // functions were still exported from "use server" files. They are out of
      // reach now, so the fallback buys nothing and costs the reader the
      // ability to see at the call site which database an irreversible write
      // lands in. See src/lib/db/lazy.ts.
      const optional = [
        ...file.code.matchAll(/^\s*(db|dbClient)\s*:[^=\n]*=[^\n]*$/gm),
      ].map((m) => m[0].trim());
      expect(
        optional,
        optional.length === 0
          ? ""
          : `${path} gives a db parameter a default (${optional.join(
              ", ",
            )}). Make it required and let the caller name the database.`,
      ).toEqual([]);
    },
  );
});

describe("inline `use server` functions are guarded too", () => {
  // A `"use server"` directive inside a function body makes that one function
  // a Server Function even though its file is not a server module. These are
  // outside the module sweep entirely, and nothing used to check them.
  const inline: { path: string; name: string }[] = [];
  const unattributed: string[] = [];

  for (const file of CANDIDATES) {
    if (file.isServerModule) continue; // already swept as a module
    for (const m of file.noComments.matchAll(/["']use server["']\s*;?/g)) {
      const at = m.index!;
      const owner = file.decls.find((d) => at >= d.start && at < d.end);
      if (!owner) {
        unattributed.push(`${file.path} @${at}`);
        continue;
      }
      inline.push({ path: file.path, name: owner.name });
    }
  }

  it("attributes every inline directive to a top-level declaration", () => {
    expect(
      unattributed,
      unattributed.length === 0
        ? ""
        : `A "use server" directive appears at ${unattributed.join(", ")} in a ` +
            `position this test does not understand, so it is not being ` +
            `checked. Hoist the Server Function to a top-level declaration, or ` +
            `teach this test the new shape — an unchecked Server Function is ` +
            `exactly the bug this file exists to prevent.`,
    ).toEqual([]);
  });

  it("finds the known inline server functions", () => {
    expect(inline.length).toBeGreaterThan(2);
  });

  it.each(inline.map((x) => [`${x.path}:${x.name}`, x] as const))(
    "%s is guarded",
    (_label, { path, name }) => {
      const file = byPath.get(path)!;
      let ok = isGuarded(name, file.byName);

      // Or it delegates to an export of a "use server" module that the sweep
      // above has already proven guarded (or allowlisted). `handleHide` in
      // src/app/admin/comments/page.tsx is exactly this: two lines forwarding
      // to `hideCommentAction`, whose auth check is the real one.
      if (!ok) {
        const body = file.byName.get(name)!.body;
        for (const [local, spec] of file.imports) {
          if (!new RegExp(`\\b${local.replace(/\$/g, "\\$")}\\s*\\(`).test(body)) {
            continue;
          }
          const target = specifierToPath(spec);
          if (!target) continue;
          const targetFile = byPath.get(target)!;
          if (!targetFile.isServerModule) continue;
          const entry = targetFile.exported.find((e) => e.exportedAs === local);
          if (!entry) continue;
          if (verdictFor(targetFile, entry.local) !== "unguarded") {
            ok = true;
            break;
          }
        }
      }

      expect(
        ok,
        `${path} declares \`${name}\` with an inline "use server" directive ` +
          `and no auth check reachable from it. That directive makes this one ` +
          `function a Server Function on its own — it is POST-reachable even ` +
          `though its file is not a server module.`,
      ).toBe(true);
    },
  );
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

  // export name -> the "use server" module exporting it, anywhere in src/.
  const allExports = new Map<string, string>();
  for (const file of SERVER_MODULES) {
    for (const e of file.exported) allExports.set(e.exportedAs, file.path);
  }

  it.each(MUST_NOT_BE_ACTION_EXPORTS)(
    '%s is not exported from any "use server" module',
    (name) => {
      expect(
        allExports.get(name) ?? null,
        `\`${name}\` is exported from ${allExports.get(
          name,
        )} again. It takes the id (or the caller identity) it operates on as a ` +
          `plain argument and verifies neither, so exporting it from a ` +
          `"use server" module makes it callable by anyone with a POST.`,
      ).toBeNull();
    },
  );
});
