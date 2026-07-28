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

interface EphemeralOpts {
  bucket: string;
  /** What the limit is per — a signer id in practice. */
  key: string;
  windowSec: number;
  max: number;
  /** Injectable clock, so tests can walk past the window without sleeping. */
  now?: number;
}

/** bucket → key → timestamps (ms) of attempts still inside their window. */
const ephemeralHits = new Map<string, Map<string, number[]>>();

/**
 * Same limiter, same options, same error — counted in process instead of in SQL.
 *
 * `enforceRateLimit` above is the preferred form and should be used wherever
 * the rate-limited write leaves a durable row to count (`comments`,
 * `comment_votes`). "Why I signed" does not: it is an UPDATE of a column on
 * `signers`, and that table has no per-edit audit row and no `updated_at`, so
 * there is nothing for a `countSql` to count. Rather than grow a second,
 * differently-shaped limiter elsewhere in the codebase, the fallback lives here
 * next to its sibling and keeps the same contract.
 *
 * THIS LIMITER IS BEST-EFFORT. It does not hold, including against the threat
 * it was added for. The counter lives in one process's memory, and on a
 * multi-instance or scale-to-zero deployment consecutive requests from one
 * signed-in signer land on whichever instance the platform picks: the effective
 * budget is `max` PER INSTANCE, and a cold start hands out a fresh one. So a
 * signer thrashing their own public statement — write something vile, let it be
 * shared, swap it back — needs only a handful of successful writes, and that
 * fits inside the slack here with room to spare. Read this as "raises the cost
 * of casual thrashing and bounds cache churn in the single-instance case", not
 * as a guarantee about how many times a statement can change in an hour.
 *
 * The durable fix needs somewhere to count, and today there is nowhere: the
 * rate-limited write is an UPDATE of a column on `signers`, which has no
 * per-edit audit row, no `updated_at` and no `why_i_signed_updated_at`. Either
 * a `why_i_signed_edits (signer_id, created_at)` table or a single
 * `signers.why_i_signed_updated_at` timestamp (cheaper, and enough for a "one
 * edit per N minutes" rule) would do; both are schema changes plus a migration.
 * With one in place this call site swaps to `enforceRateLimit` with a `countSql`
 * over it and nothing else has to change. Until then, do not let the presence of
 * this call talk anyone out of moderation tooling that does not depend on it.
 */
export function enforceEphemeralRateLimit(opts: EphemeralOpts): void {
  const now = opts.now ?? Date.now();
  const cutoff = now - opts.windowSec * 1000;

  let byKey = ephemeralHits.get(opts.bucket);
  if (!byKey) {
    byKey = new Map();
    ephemeralHits.set(opts.bucket, byKey);
  }
  const recent = (byKey.get(opts.key) ?? []).filter((t) => t > cutoff);

  if (recent.length >= opts.max) {
    // Keep the pruned list so the window still slides while a caller is being
    // refused, but do NOT record the refused attempt — otherwise a client that
    // retries in a loop would hold its own limit open indefinitely.
    byKey.set(opts.key, recent);
    throw new Error(
      `Rate limit exceeded for ${opts.bucket}: ${recent.length}/${opts.max} in last ${opts.windowSec}s.`,
    );
  }

  recent.push(now);
  byKey.set(opts.key, recent);
}

/** Test-only: drop all in-process counters. */
export function resetEphemeralRateLimits(): void {
  ephemeralHits.clear();
}
