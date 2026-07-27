/**
 * Lazy access to the production database client.
 *
 * `src/lib/db/index.ts` throws at module-evaluation time when `DATABASE_URL`
 * is unset, so importing it at the top of a module makes that module
 * unimportable from a test — and the tests here run against pglite with their
 * own client. Every module that needs the production client only at CALL time
 * therefore grew its own copy of the same six-line
 * `let _db … function getDb()` block. There were nineteen of them. This is
 * that block, once.
 *
 * WHERE THIS BELONGS. On the `"use server"` wrappers in
 * `src/server/actions/`, which are entry points: nobody hands them a db, so
 * they resolve one.
 *
 * WHERE IT DOES NOT. In the plain data-layer modules under
 * `src/server/<domain>/`. Those take `db` as a REQUIRED first argument. Four
 * of them used to take an optional one that fell back to this resolver, which
 * is precisely what made them dangerous while they were still exported from
 * `"use server"` files: `deleteSigner(null, "<public-signer-id>")` was a
 * working POST against production. They are unreachable by POST now, so the
 * fallback bought nothing and cost the reader the ability to see, at the call
 * site, which database a destructive write lands in. Make the caller say.
 */

let _db: unknown | null = null;

export function getDb(): any {
  if (!_db) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _db = (require("@/lib/db") as { db: unknown }).db;
  }
  return _db;
}
