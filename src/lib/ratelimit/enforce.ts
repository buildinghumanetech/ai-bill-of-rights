import { and, eq, gte, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";

export class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RateLimitError";
  }
}

export interface RateLimitOptions {
  table: PgTable<any>;
  timestampColumn: any;
  whereSignerColumn: any;
  signerId: string;
  windowSeconds: number;
  limit: number;
  errorMessage: string;
}

export async function enforceRateLimit(
  db: any,
  opts: RateLimitOptions,
): Promise<{ allowed: true }> {
  const windowStart = new Date(Date.now() - opts.windowSeconds * 1000);
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(opts.table)
    .where(
      and(
        eq(opts.whereSignerColumn, opts.signerId),
        gte(opts.timestampColumn, windowStart),
      ),
    );
  const count = Number(rows[0]?.count ?? 0);
  if (count >= opts.limit) {
    throw new RateLimitError(opts.errorMessage);
  }
  return { allowed: true };
}
