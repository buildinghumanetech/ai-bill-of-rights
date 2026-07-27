# Branch Progress: sparkle/agent-456e6255-3eca-45a1-8406-b1fd3f79ed33

## Progress Update as of [2026-07-26 23:00 Pacific]
*(Most recent updates at top)*

### Summary of changes since last update

Hardened `tests/server/actions.guarded.test.ts` — the test that keeps the
"no unauthenticated Server Function" refactor from regressing — after a review
found four ways straight past it. The sweep is now repo-wide and selected by
directive prologue rather than pinned to `src/server/actions/`; re-exports
(`export {…} from`, `export *`), `export default` and bare aliases are all
recognised; comments and string literals are stripped before anything is
matched and declaration bodies end at their own closing brace; and `await
auth()` only counts as a guard when the value it binds is actually rejected.
Every one of those is mutation-verified (11 mutations, all RED). Alongside
that: relabelled the `/account` entry point into the deletion cascade, extracted
the nineteen copies of the lazy `getDb()` block into `src/lib/db/lazy.ts` and
made `db` a required first argument on the four data-layer modules that still
defaulted it to production, and corrected the false "click-gated" claim about
the attestation verification token.

### Detail of changes made:

**1. `tests/server/actions.guarded.test.ts` — rewritten (the main change).**
- **Scope.** `ACTIONS_DIR` is gone. `walkSource()` globs `src/**/*.{ts,tsx}`;
  a file is swept when its *directive prologue* is `"use server"`. Adding the
  directive to any of the ten plain modules under `src/server/<domain>/` used
  to reopen every hole the refactor closed with a green suite.
- **Companion assertion** (`describe("plain data-layer modules stay plain")`):
  no module under `src/server/` outside `src/server/actions/` may carry a
  `"use server"` directive at all. Cheapest guard in the file. It has to read
  comment-stripped source because those modules' docstrings talk *about* the
  directive.
- **Inline directives.** `"use server"` inside a function body makes that one
  function a Server Function even in a non-server module; three such functions
  exist (`src/app/admin/attestations/page.tsx`, `src/app/admin/comments/
  page.tsx`, `src/components/AttestationForm.tsx`) and nothing checked them.
  They are now checked, resolving either locally or through one hop to an
  export of a swept module whose verdict is already known (`handleHide` →
  `hideCommentAction`). A directive in a position the parser cannot attribute
  to a top-level declaration fails loudly rather than being skipped.
- **Export forms.** `parseTopLevelDecls` now also matches `^export default`
  and `export const foo = <anything>` (previously it required `(` or
  `function` after the `=`, so the alias `export const raw = deleteSigner` was
  invisible). Re-exports — `^export\s*\{…\}…from` and `^export\s*\*` — fail
  outright in their own test rather than being verdict-checked: a re-export
  forwards a binding verbatim and can never carry an auth check. This is the
  likeliest regression path, since it is how a broken import gets "fixed".
- **`stripSource()`.** A single-pass scanner producing two same-length views:
  `noComments` (literals kept — needed because the directive IS a string
  literal) and `code` (comments *and* literals blanked — what every parse and
  guard match reads). Handles line/block comments, quoted strings, template
  literals with `${}` interpolation (the interpolated expression is kept as
  code; the `${`/`}` are blanked so brace matching stays balanced) and regex
  literals. `<` and `>` are deliberately excluded from the regex-start
  character set so JSX (`</div>`, `<br />`) is never read as one.
- **`declEnd()`.** A body ends at its own closing brace, brace-matched, not at
  the next declaration's start — that over-read is what let a docstring
  mentioning `auth()` mark the *preceding* unguarded export as guarded, and
  this repo writes exactly such docstrings. Brace matching has to skip inline
  return types: `): Promise<{ ok: boolean }> {` puts `}>` at column 0, so a
  naive "first unindented `}`" ends the body before it starts (this bit twice
  — `reportCommentAction` and `removeMySignature`). Each balanced group is
  therefore tested by the character that follows it (`>|&,)]=:?` ⇒ it was a
  type, keep going).
- **`hasRootGuard()`.** Replaces the bare `/\bauth\s*\(/`. A guard call counts
  only if the value it binds is rejected afterwards — `if (!userId)`,
  `if (ctx.state !== "admin")`, `userId ??`/`&&`/`||`. All twenty-odd call
  sites in the repo already follow that shape.
- `PUBLIC_BY_DESIGN` is keyed by repo-relative path now (`src/server/actions/
  contact.ts:sendContactMessageAction`), so an allowlist entry cannot leak onto
  a same-named file elsewhere. Allowlist honesty test also asserts the named
  file really is a server module.
- New assertion: no plain data-layer module may give a `db` parameter a
  default (see item 3 below).
- 83 test cases, up from 25.

**2. Mutation verification.** All eleven go RED and the suite returns to green
after each restore. Scripts are in `.sparkle/` (untracked, not committed):
`1` `"use server"` added to `src/server/signers/delete.ts`;
`2` `export { deleteSigner } from "@/server/signers/delete"` in `revoke.ts`;
`3` `export * from …` in the same;
`4` an unguarded export followed by a declaration whose docstring says
`auth()`;
`5` `export const deleteSignerRaw = deleteSigner;`;
`6` `export default deleteSigner;`;
`7` the `if (!userId)` line deleted from `submitRevokeAction`;
`8` an unguarded inline `"use server"` function in `AttestationForm.tsx`;
`9` the optional-leading-db signature restored on `deleteSigner`;
`10`/`11` the `/account` link relabelled back / understated differently.

**3. `src/lib/db/lazy.ts` (new) — one lazy resolver instead of nineteen.**
The `let _db … function getDb()` block was copy-pasted into every action file,
`src/lib/admin/check.ts`, and four data-layer modules. It exists because
`src/lib/db/index.ts` throws at module-eval time without `DATABASE_URL`, which
would make these modules unimportable from the pglite tests. It now lives in
one place; `src/server/actions/invite.ts` was deliberately left alone (owned by
another worker) and still has its own copy. Consequence: `eslint` errors drop
from 180 to 138 (all pre-existing `no-explicit-any`; none added).

**4. `db` is a required first argument in the data layer.** `deleteSigner`,
`createAttestation`, `verifyAttestationToken`, `approveAttestation`,
`hideAttestation`, `recordSignature` and `upsertSignerProfile` took an optional
leading db that fell back to the production client. That signature is precisely
what made them dangerous as Server Functions — `deleteSigner(null, "<public
signer id>")` was the whole exploit — and now that they are unreachable by POST
the fallback buys nothing while hiding which database an irreversible write
lands in. Callers updated: `src/app/attestations/verify/[token]/page.tsx` and
`src/server/actions/attestations.ts` use `getDb()`; `src/app/admin/
attestations/page.tsx` passes the `db` it already imports; `sign-from-modal.ts`
uses `getDb()` in `recordSignatureFromModal` and the `prodDb` it already
resolves in `createSignerFromModal`. `tests/server/sign-from-modal.attribution.
test.ts` now stubs `@/lib/db/lazy` and asserts the action forwards that client.
The other domain modules (`comments/*`, `selfies/core.ts`,
`admin/non-signers.ts`) already required an explicit db and are unchanged.

**5. `src/app/account/AccountClient.tsx` — the deletion entry point.** Was
"Remove all my signatures and delete my profile →", which names two of the nine
things the cascade destroys. Now "Delete my account — signatures, comments,
proposals and photos →". `/account/revoke` and the SignModal confirm dialog
already enumerated the full cascade; this link was missed.
`tests/app/account.revoke-entry-point.test.ts` (new) pins it.

**6. The attestation token is NOT click-gated — docstrings corrected.**
`src/app/attestations/verify/[token]/page.tsx` is a `force-dynamic` server
component that calls `verifyAttestationToken` during render, so any GET
publishes: a mail-gateway link scanner, an email client prefetch or a proxy
warming the URL all publish an organisation's public claim with no human
involved. **Chose to soften the docstrings rather than add a confirm button**
— the behaviour is pre-existing and unchanged by this commit, the false claim
is what was new, and converting the page to a POST confirm flow is a UX change
that deserves its own commit and its own decision. `src/server/attestations/
core.ts`, `src/server/actions/attestations.ts` and the guard test's
`PUBLIC_BY_DESIGN` entry now say the token authorises any request carrying it,
including automated ones, and name the confirm-button fix for whoever wants it.

### Potential concerns to address:

- **The verify page still publishes on GET.** Item 6 above documents it; it is
  not fixed. If an attesting org's email provider prefetches links, their claim
  goes public without them clicking. The fix is a confirm button that POSTs.
- **`src/server/actions/invite.ts` still has its own `getDb()` copy** — it was
  off-limits to this worker. Fold it into `@/lib/db/lazy` when that branch
  lands.
- **The guard test is a source-text parser, not an AST walk.** That is
  deliberate (blunt and unmissable) but it does assume Prettier formatting:
  top-level declarations at column 0, closing braces unindented. A file
  formatted differently could slip a declaration past `parseTopLevelDecls`.
  The `use server`-in-an-unattributable-position test is the backstop for the
  most dangerous version of that, but it is not total.
- **Cross-module resolution is one hop and only for `@/`-alias imports.** An
  inline server function that delegates through two modules would be reported
  unguarded. No such case exists today.
- **`eslint` is red on `main` and stays red** (138 pre-existing
  `no-explicit-any` errors). Not introduced here — the count went *down* by 42
  — but the lint gate is not usable as a signal until someone clears it.
- `listPublishedAttestations(undefined, …)` in `src/app/attestations/page.tsx`
  and `src/app/v/[version]/as-code/page.tsx` still uses the optional-db form.
  It is a read-only query module, so it is not in the same risk class, but the
  convention is now split.

---
