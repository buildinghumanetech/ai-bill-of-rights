// src/lib/ratelimit/enforce.ts
import { sql } from "drizzle-orm";

interface EnforceOpts {
  bucket: string;
  signerId: string;
  windowSec: number;
  max: number;
  /**
   * A SQL count statement returning a single column `n` (integer). Use `$1`
   * for the signer id. The window is enforced inside this query — keep
   * `countSql` aligned with `windowSec`.
   */
  countSql: string;
}

export async function enforceRateLimit(
  db: any,
  opts: EnforceOpts,
): Promise<void> {
  const result = await db.execute(
    sql.raw(opts.countSql.replace("$1", `'${opts.signerId.replace(/'/g, "''")}'`)),
  );
  const rows = (result.rows ?? result) as Array<{ n: number }>;
  const n = Number(rows[0]?.n ?? 0);
  if (n >= opts.max) {
    throw new Error(
      `Rate limit exceeded for ${opts.bucket}: ${n}/${opts.max} in last ${opts.windowSec}s.`,
    );
  }
}
