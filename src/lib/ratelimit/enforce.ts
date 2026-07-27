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

/**
 * Thrown when — and only when — a caller is genuinely over the limit.
 *
 * Callers that need to tell "you are rate limited" apart from "the check itself
 * blew up" must branch on `instanceof RateLimitError`, never on the message
 * text. A regex against a string produced in this module is a contract across a
 * module boundary that nothing enforces: reword the throw and every real
 * rejection silently starts being reported as an internal failure.
 */
export class RateLimitError extends Error {
  readonly code = "rate_limited" as const;
  constructor(
    readonly bucket: string,
    readonly count: number,
    readonly max: number,
    readonly windowSec: number,
  ) {
    super(
      `Rate limit exceeded for ${bucket}: ${count}/${max} in last ${windowSec}s.`,
    );
    this.name = "RateLimitError";
  }
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
    // Message text unchanged — existing callers surface it to the user
    // directly. What is new is that the TYPE now carries the meaning.
    throw new RateLimitError(opts.bucket, n, opts.max, opts.windowSec);
  }
}
