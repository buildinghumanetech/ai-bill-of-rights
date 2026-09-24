/**
 * Admin referral reporting (/admin/referrals).
 *
 * "Referred" here always means: `signers.referred_by_signer_id` is set AND the
 * signer holds at least one signature. Someone who arrived through a share
 * link but only made a comment account has not been "brought in" to the bill,
 * so they are left out of every number on the page.
 *
 * The column went live in production on 2026-09-24, so nothing before that is
 * attributable. The share-of-signers denominator is restricted to signers
 * created on or after that date for the same reason — dividing by everyone
 * since launch would make the percentage meaningless.
 *
 * Plain module (not `"use server"`); callers must authorise. Every function
 * takes `db` explicitly so the queries can run against pglite in tests.
 */

import { and, count, eq, exists, gte, isNotNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { signatures, signers } from "@/lib/db/schema";

/**
 * Either the Neon client or a pglite one in tests — same convention as the
 * `db: any` parameters in queries.ts.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/** Midnight Pacific (PDT, UTC-7) on 2026-09-24 — when the column went live. */
export const REFERRAL_TRACKING_START = new Date("2026-09-24T07:00:00Z");

export interface ReferralTotals {
  /** Signers with a signature who arrived through someone's share link. */
  referredSigners: number;
  /** All signers with a signature created since REFERRAL_TRACKING_START. */
  signersSinceTrackingStart: number;
}

export interface ReferredPerson {
  signerId: string;
  displayName: string;
  /** Their earliest signature — "when they signed because of you". */
  signedAt: Date;
}

export interface Referrer {
  signerId: string;
  displayName: string;
  count: number;
  /** Newest first. */
  referred: ReferredPerson[];
}

function hasSignature() {
  return exists(
    sql`(select 1 from ${signatures} where ${signatures.signerId} = ${signers.id})`,
  );
}

export async function getReferralTotals(db: Db): Promise<ReferralTotals> {
  const since = gte(signers.createdAt, REFERRAL_TRACKING_START);

  const [[referred], [denominator]] = await Promise.all([
    db
      .select({ value: count() })
      .from(signers)
      .where(
        and(isNotNull(signers.referredBySignerId), since, hasSignature()),
      ),
    db
      .select({ value: count() })
      .from(signers)
      .where(and(since, hasSignature())),
  ]);

  return {
    referredSigners: Number(referred?.value ?? 0),
    signersSinceTrackingStart: Number(denominator?.value ?? 0),
  };
}

/**
 * Everyone who brought in at least one signer, ranked by how many (desc),
 * ties broken by display name. Each carries the list of people they brought in.
 */
export async function listReferrers(db: Db): Promise<Referrer[]> {
  const referrer = alias(signers, "referrer");

  const rows: Array<{
    referrerId: string;
    referrerName: string;
    signerId: string;
    displayName: string;
    signedAt: Date | string;
  }> = await db
    .select({
      referrerId: referrer.id,
      referrerName: referrer.displayName,
      signerId: signers.id,
      displayName: signers.displayName,
      signedAt: sql<Date>`min(${signatures.signedAt})`.mapWith(
        (v: string | Date) => (v instanceof Date ? v : new Date(v)),
      ),
    })
    .from(signers)
    .innerJoin(referrer, eq(referrer.id, signers.referredBySignerId))
    // Inner join on signatures is what drops referred signers who never signed.
    .innerJoin(signatures, eq(signatures.signerId, signers.id))
    .groupBy(referrer.id, referrer.displayName, signers.id, signers.displayName);

  const byReferrer = new Map<string, Referrer>();
  for (const r of rows) {
    let entry = byReferrer.get(r.referrerId);
    if (!entry) {
      entry = {
        signerId: r.referrerId,
        displayName: r.referrerName,
        count: 0,
        referred: [],
      };
      byReferrer.set(r.referrerId, entry);
    }
    entry.count += 1;
    entry.referred.push({
      signerId: r.signerId,
      displayName: r.displayName,
      signedAt: r.signedAt instanceof Date ? r.signedAt : new Date(r.signedAt),
    });
  }

  const out = [...byReferrer.values()];
  for (const e of out) {
    e.referred.sort((a, b) => b.signedAt.getTime() - a.signedAt.getTime());
  }
  out.sort(
    (a, b) =>
      b.count - a.count ||
      a.displayName.localeCompare(b.displayName) ||
      a.signerId.localeCompare(b.signerId),
  );
  return out;
}
