/**
 * Lazy access to the production database client.
 *
 * This docstring used to claim `src/lib/db/index.ts` throws at
 * module-evaluation time when `DATABASE_URL` is unset. It does not: it exports
 * `db` as a `Proxy` whose `get` trap calls `getDb()`, so importing the module
 * is safe and only *touching a property* throws. Worth stating plainly, because
 * the false version made this file look load-bearing for importability — and a
 * future reader who checked would have found the claim didn't hold and been
 * left unsure what else here was stale.
 *
 * The real reason is duplication, not import safety. A module that needs the
 * production client at CALL time still has to defer resolution so tests can run
 * against pglite with their own client, and nineteen modules had each grown a
 * private copy of the same six-line `let _db … function getDb()` block. This is
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
