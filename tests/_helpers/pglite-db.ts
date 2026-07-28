import { createRequire } from "node:module";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "@/lib/db/schema";

export type TestDb = ReturnType<typeof drizzle<typeof schema>>;

/**
 * drizzle-kit's ESM build (`api.mjs`) is bundled with a `__require` shim that
 * throws `Dynamic require of "fs" is not supported` the moment it is loaded, so
 * a bare `import ... from "drizzle-kit/api"` cannot be used here. The CJS build
 * is fine; reach it through createRequire.
 */
const require = createRequire(import.meta.url);
const { generateDrizzleJson, generateMigration } =
  require("drizzle-kit/api") as typeof import("drizzle-kit/api");

/**
 * The DDL for the whole schema, derived from `src/lib/db/schema.ts` itself.
 *
 * This used to be a hand-written block of raw DDL that mirrored schema.ts by
 * eye. That mirror is exactly the kind of duplicate that rots silently: it
 * drifted (missing check constraints, primary keys the real schema does not
 * have) and, worse, it made the test suite blind to schema.ts regressions —
 * deleting `onDelete: "set null"` from the referral FK left every test green
 * because no test ever built a database from the file that ships.
 *
 * `generateMigration(emptySnapshot, currentSnapshot)` is what `drizzle-kit
 * generate` runs internally, so this is the same SQL the tool would emit for a
 * from-scratch database. It is a pure in-memory computation (~20ms) but there
 * is no reason to repeat it per test, so it is memoised at module scope and the
 * resulting SQL is replayed into each new PGlite instance.
 */
let ddl: Promise<string> | undefined;
function schemaDdl(): Promise<string> {
  ddl ??= generateMigration(
    generateDrizzleJson({}),
    generateDrizzleJson(schema),
  ).then((statements) => statements.join("\n"));
  return ddl;
}

/**
 * Returns an in-memory Postgres bound to drizzle with the current schema
 * applied. Each call returns a fresh, isolated database.
 */
export async function createTestDb(): Promise<TestDb> {
  const client = new PGlite();
  await client.ready;
  const db = drizzle(client, { schema });
  // client.exec() rather than db.execute(sql`...`): pglite's prepared-statement
  // path rejects multi-command strings, exec() handles them correctly.
  await client.exec(await schemaDdl());
  return db;
}
