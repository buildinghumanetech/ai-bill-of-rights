import { and, eq, inArray, isNull, sql, desc } from "drizzle-orm";
import { selfies, selfieReports, signers } from "@/lib/db/schema";

function getDefaultDb() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("@/lib/db").db;
}

// Reusable predicate for "this row is the signer's currently-active approved
// selfie." Matches the partial-unique index in the migration.
function activeApprovedFilter() {
  return and(
    eq(selfies.status, "approved"),
    isNull(selfies.autoHiddenAt),
    isNull(selfies.removedAt),
    isNull(selfies.replacedBySelfieId),
  );
}

export interface SelfieRow {
  id: string;
  signerId: string;
  status: string;
  displayBlobUrl: string;
  thumbnailBlobUrl: string;
  submittedAt: Date;
  reviewedAt: Date | null;
  rejectionReason: string | null;
  autoHiddenAt: Date | null;
  removedAt: Date | null;
  replacedBySelfieId: string | null;
}

export async function getActiveSelfieForSigner(
  signerId: string,
  dbArg: any = null,
): Promise<SelfieRow | null> {
  const db = dbArg ?? getDefaultDb();
  const rows = await db
    .select()
    .from(selfies)
    .where(and(eq(selfies.signerId, signerId), activeApprovedFilter()))
    .limit(1);
  return (rows[0] as SelfieRow) ?? null;
}

export async function getActiveSelfiesForSigners(
  signerIds: string[],
  dbArg: any = null,
): Promise<
  Map<string, { displayBlobUrl: string; thumbnailBlobUrl: string }>
> {
  if (signerIds.length === 0) return new Map();
  const db = dbArg ?? getDefaultDb();
  const rows = await db
    .select({
      signerId: selfies.signerId,
      displayBlobUrl: selfies.displayBlobUrl,
      thumbnailBlobUrl: selfies.thumbnailBlobUrl,
    })
    .from(selfies)
    .where(and(inArray(selfies.signerId, signerIds), activeApprovedFilter()));
  const map = new Map<
    string,
    { displayBlobUrl: string; thumbnailBlobUrl: string }
  >();
  for (const r of rows) {
    map.set(r.signerId, {
      displayBlobUrl: r.displayBlobUrl,
      thumbnailBlobUrl: r.thumbnailBlobUrl,
    });
  }
  return map;
}

export async function countUnresolvedReports(
  selfieId: string,
  dbArg: any = null,
): Promise<number> {
  const db = dbArg ?? getDefaultDb();
  const rows = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(selfieReports)
    .where(
      and(
        eq(selfieReports.selfieId, selfieId),
        isNull(selfieReports.resolvedAt),
      ),
    );
  return Number(rows[0]?.value ?? 0);
}

export type LatestSelfieForSigner = SelfieRow;

/**
 * Most-recent selfie for a signer, regardless of status. Used on /account
 * to drive the SelfieCard UI: shows pending / approved / rejected / auto-hidden
 * state based on the latest row.
 */
export async function getLatestSelfieForSigner(
  signerId: string,
  dbArg: any = null,
): Promise<LatestSelfieForSigner | null> {
  const db = dbArg ?? getDefaultDb();
  const rows = await db
    .select()
    .from(selfies)
    .where(eq(selfies.signerId, signerId))
    .orderBy(desc(selfies.submittedAt))
    .limit(1);
  return (rows[0] as LatestSelfieForSigner) ?? null;
}

export interface AdminSelfieRow {
  id: string;
  signerId: string;
  displayBlobUrl: string;
  submittedAt: Date;
  reviewedAt: Date | null;
  captureMethod: string;
  rejectionReason: string | null;
  autoHiddenAt: Date | null;
  signer: {
    displayName: string;
    affiliation: string | null;
    locationText: string | null;
    verificationMethod: string;
    memberSince: Date;
  };
}

async function adminSelfieRows(
  db: any,
  filter: any,
): Promise<AdminSelfieRow[]> {
  const rows = await db
    .select({
      id: selfies.id,
      signerId: selfies.signerId,
      displayBlobUrl: selfies.displayBlobUrl,
      submittedAt: selfies.submittedAt,
      reviewedAt: selfies.reviewedAt,
      captureMethod: selfies.captureMethod,
      rejectionReason: selfies.rejectionReason,
      autoHiddenAt: selfies.autoHiddenAt,
      displayName: signers.displayName,
      affiliation: signers.affiliation,
      locationText: signers.locationText,
      verificationMethod: signers.verificationMethod,
      memberSince: signers.createdAt,
    })
    .from(selfies)
    .innerJoin(signers, eq(signers.id, selfies.signerId))
    .where(filter)
    .orderBy(desc(selfies.submittedAt));
  return rows.map((r: any) => ({
    id: r.id,
    signerId: r.signerId,
    displayBlobUrl: r.displayBlobUrl,
    submittedAt: r.submittedAt,
    reviewedAt: r.reviewedAt,
    captureMethod: r.captureMethod,
    rejectionReason: r.rejectionReason,
    autoHiddenAt: r.autoHiddenAt,
    signer: {
      displayName: r.displayName,
      affiliation: r.affiliation,
      locationText: r.locationText,
      verificationMethod: r.verificationMethod,
      memberSince: r.memberSince,
    },
  }));
}

export async function getPendingSelfies(
  dbArg: any = null,
): Promise<AdminSelfieRow[]> {
  const db = dbArg ?? getDefaultDb();
  return adminSelfieRows(db, eq(selfies.status, "pending"));
}

export async function getAutoHiddenSelfies(
  dbArg: any = null,
): Promise<AdminSelfieRow[]> {
  const db = dbArg ?? getDefaultDb();
  // Auto-hidden = approved but autoHiddenAt is set.
  return (
    await adminSelfieRows(db, eq(selfies.status, "approved"))
  ).filter((r) => r.autoHiddenAt !== null);
}

export async function getRejectedSelfies(
  dbArg: any = null,
): Promise<AdminSelfieRow[]> {
  const db = dbArg ?? getDefaultDb();
  return adminSelfieRows(db, eq(selfies.status, "rejected"));
}

export async function getApprovedSelfiesForAdmin(
  dbArg: any = null,
): Promise<AdminSelfieRow[]> {
  const db = dbArg ?? getDefaultDb();
  // Approved AND not auto-hidden AND not replaced AND not removed.
  return (
    await adminSelfieRows(db, eq(selfies.status, "approved"))
  ).filter((r) => r.autoHiddenAt === null);
}
