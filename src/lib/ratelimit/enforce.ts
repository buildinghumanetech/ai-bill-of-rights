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
 * Known limitation, stated plainly: the counter is per process, so on a
 * multi-instance or scale-to-zero deployment the effective limit is per
 * instance and resets on cold start. That is a real weakening for a
 * brute-force-shaped attack; it is adequate for the thing this limit exists to
 * stop, which is one signed-in signer thrashing their own public statement. The
 * durable fix is a `why_i_signed_edits (signer_id, created_at)` table in
 * `src/lib/db/schema.ts` plus the matching migration, at which point this call
 * site swaps to `enforceRateLimit` with a `countSql` over that table and
 * nothing else has to change.
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
