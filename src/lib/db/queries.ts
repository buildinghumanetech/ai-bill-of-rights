import { eq, count, desc, and, isNull, isNotNull, sql } from "drizzle-orm";
import { versions, signatures, signers, attestations, comments, commentUpvotes, reports } from "./schema";

// Lazily resolve the production db so that importing this module in tests
// (which always pass an explicit `db`) does not trigger the DATABASE_URL guard
// inside src/lib/db/index.ts at module-evaluation time.
function getDefaultDb() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("./index").db;
}

export async function getCurrentVersion(db: any = getDefaultDb()) {
  const rows = await db
    .select()
    .from(versions)
    .where(eq(versions.isCurrent, true))
    .limit(1);
  return rows[0] ?? null;
}

export async function getVersionByString(versionString: string, db: any = getDefaultDb()) {
  const rows = await db
    .select()
    .from(versions)
    .where(eq(versions.version, versionString))
    .limit(1);
  return rows[0] ?? null;
}

export async function getSignatureCount(db: any = getDefaultDb()): Promise<number> {
  const rows = await db.select({ value: count() }).from(signatures);
  return Number(rows[0]?.value ?? 0);
}

export interface SignerListItem {
  signerId: string;
  displayName: string;
  locationText: string | null;
  affiliation: string | null;
  verificationMethod: "email" | "sms";
  signedAt: Date;
  version: string;
}

export async function listSignatures(
  db: any = null,
  opts: { limit: number; offset: number },
): Promise<SignerListItem[]> {
  const client = db ?? getDefaultDb();
  const rows = await client
    .select({
      signerId: signers.id,
      displayName: signers.displayName,
      locationText: signers.locationText,
      affiliation: signers.affiliation,
      verificationMethod: signers.verificationMethod,
      signedAt: signatures.signedAt,
      version: versions.version,
    })
    .from(signatures)
    .innerJoin(signers, eq(signers.id, signatures.signerId))
    .innerJoin(versions, eq(versions.id, signatures.versionId))
    .orderBy(desc(signatures.signedAt))
    .limit(opts.limit)
    .offset(opts.offset);
  return rows as SignerListItem[];
}

export async function getSignerById(signerId: string, db: any = null) {
  const client = db ?? getDefaultDb();
  const rows = await client
    .select()
    .from(signers)
    .where(eq(signers.id, signerId))
    .limit(1);
  return rows[0] ?? null;
}

export async function listSignaturesForSigner(
  signerId: string,
  db: any = null,
) {
  const client = db ?? getDefaultDb();
  const rows = await client
    .select({
      signedAt: signatures.signedAt,
      version: versions.version,
    })
    .from(signatures)
    .innerJoin(versions, eq(versions.id, signatures.versionId))
    .where(eq(signatures.signerId, signerId))
    .orderBy(desc(signatures.signedAt));
  return rows;
}

export interface AttestationListItem {
  id: string;
  orgName: string;
  productName: string;
  productUrl: string | null;
  version: string;
  claimedAt: Date;
}

export async function listPublishedAttestations(
  db: any = null,
  opts: { limit: number; offset: number; versionString?: string },
): Promise<AttestationListItem[]> {
  const client = db ?? getDefaultDb();
  const conditions = [
    eq(attestations.published, true),
    isNull(attestations.hiddenAt),
  ];
  if (opts.versionString) {
    const v = await client
      .select({ id: versions.id })
      .from(versions)
      .where(eq(versions.version, opts.versionString))
      .limit(1);
    if (v.length === 0) return [];
    conditions.push(eq(attestations.versionId, v[0].id));
  }
  const rows = await client
    .select({
      id: attestations.id,
      orgName: attestations.orgName,
      productName: attestations.productName,
      productUrl: attestations.productUrl,
      version: versions.version,
      claimedAt: attestations.claimedAt,
    })
    .from(attestations)
    .innerJoin(versions, eq(versions.id, attestations.versionId))
    .where(and(...conditions))
    .orderBy(desc(attestations.claimedAt))
    .limit(opts.limit)
    .offset(opts.offset);
  return rows as AttestationListItem[];
}

export async function listPendingReviewAttestations(db: any = null) {
  const client = db ?? getDefaultDb();
  return client
    .select({
      id: attestations.id,
      orgName: attestations.orgName,
      productName: attestations.productName,
      productUrl: attestations.productUrl,
      contactEmail: attestations.contactEmail,
      claimedAt: attestations.claimedAt,
      emailVerifiedAt: attestations.emailVerifiedAt,
      version: versions.version,
    })
    .from(attestations)
    .innerJoin(versions, eq(versions.id, attestations.versionId))
    .where(
      and(
        eq(attestations.needsManualReview, true),
        isNotNull(attestations.emailVerifiedAt),
        isNull(attestations.manuallyReviewedAt),
        isNull(attestations.hiddenAt),
      ),
    )
    .orderBy(desc(attestations.claimedAt));
}

export interface CommentTreeItem {
  id: string;
  versionId: string;
  anchorId: string;
  body: string;
  parentCommentId: string | null;
  createdAt: Date;
  hiddenAt: Date | null;
  signerId: string;
  displayName: string;
  locationText: string | null;
  affiliation: string | null;
  verificationMethod: "email" | "sms";
  upvoteCount: number;
}

export async function listCommentsForAnchor(
  db: any = null,
  versionId: string,
  anchorId: string,
): Promise<CommentTreeItem[]> {
  const client = db ?? getDefaultDb();
  const rows = await client
    .select({
      id: comments.id,
      versionId: comments.versionId,
      anchorId: comments.anchorId,
      body: comments.body,
      parentCommentId: comments.parentCommentId,
      createdAt: comments.createdAt,
      hiddenAt: comments.hiddenAt,
      signerId: signers.id,
      displayName: signers.displayName,
      locationText: signers.locationText,
      affiliation: signers.affiliation,
      verificationMethod: signers.verificationMethod,
      upvoteCount: sql<number>`(select count(*)::int from ${commentUpvotes} where ${commentUpvotes.commentId} = ${comments.id})`,
    })
    .from(comments)
    .innerJoin(signers, eq(signers.id, comments.signerId))
    .where(
      and(
        eq(comments.versionId, versionId),
        eq(comments.anchorId, anchorId),
      ),
    )
    .orderBy(comments.createdAt);
  return rows as CommentTreeItem[];
}

export async function countCommentsByAnchor(
  db: any = null,
  versionId: string,
): Promise<Record<string, number>> {
  const client = db ?? getDefaultDb();
  const rows = await client
    .select({
      anchorId: comments.anchorId,
      count: sql<number>`count(*)::int`,
    })
    .from(comments)
    .where(
      and(
        eq(comments.versionId, versionId),
        isNull(comments.hiddenAt),
      ),
    )
    .groupBy(comments.anchorId);
  const out: Record<string, number> = {};
  for (const r of rows) out[r.anchorId] = Number(r.count);
  return out;
}

export async function listPendingReports(db: any = null) {
  const client = db ?? getDefaultDb();
  return client
    .select({
      reportId: reports.id,
      commentId: reports.commentId,
      reason: reports.reason,
      createdAt: reports.createdAt,
      commentBody: comments.body,
      commentAnchorId: comments.anchorId,
      commentVersion: versions.version,
      reporterName: signers.displayName,
    })
    .from(reports)
    .innerJoin(comments, eq(comments.id, reports.commentId))
    .innerJoin(versions, eq(versions.id, comments.versionId))
    .innerJoin(signers, eq(signers.id, reports.reporterSignerId))
    .where(isNull(reports.resolvedAt))
    .orderBy(desc(reports.createdAt));
}
