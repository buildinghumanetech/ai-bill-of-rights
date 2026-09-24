/**
 * The one database type every module should accept.
 *
 * WHY THIS EXISTS. Production runs drizzle over neon-http
 * (`NeonHttpDatabase<typeof schema>`, see `./index.ts`) and the tests run it
 * over pglite (`PgliteDatabase<typeof schema>`, see `tests/_helpers/pglite-db.ts`).
 * Those are two different types, so the seventy-odd functions that take a `db`
 * argument had all settled on `db: any` — which silenced the type checker on
 * every query in the data layer, not just on the driver difference it was
 * working around.
 *
 * `Db` is the drizzle base class both drivers extend, instantiated with this
 * project's schema. It carries NO `any`: both concrete databases are assignable
 * to it, and the operations this codebase performs — select/insert/update/delete,
 * `.returning()`, `.orderBy()`, and raw `db.execute(sql\`…\`)` — all typecheck
 * through it. So `db: Db` costs nothing in flexibility and buys back real
 * checking on table names, column names and inserted shapes.
 *
 * WHAT IT DELIBERATELY DOES NOT PROMISE. `PgQueryResultHKT` is the unresolved
 * result-kind, because the two drivers genuinely disagree on what
 * `db.execute()` hands back (neon-http returns a result object, pglite returns
 * rows). Code that reads the result of a raw `execute` still has to narrow it
 * itself — that difference is real, and pretending otherwise here would just
 * move the lie somewhere harder to find.
 *
 * Nullable positions use `Db | null`, not `any`: several entry points take
 * `db: Db | null = null` and fall back to the production client. See
 * `./lazy.ts` for why the fallback exists and where it is appropriate.
 */

import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "./schema";

export type Db = PgDatabase<
  PgQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;
