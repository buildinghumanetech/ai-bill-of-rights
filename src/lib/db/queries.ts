import { eq, count, desc, gt, and, isNull, isNotNull, asc, inArray } from "drizzle-orm";
import { versions, signatures, signers, comments, attestations, proposedEdits, proposalUpvotes, endorsements } from "./schema";

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

export async function getSignerCount(db: any = getDefaultDb()): Promise<number> {
  const rows = await db.select({ value: count() }).from(signers);
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

export interface RecentSignerEvent {
  id: string;
  displayName: string;
  locationText: string | null;
  signedAt: Date;
}

const SIXTY_MINUTES_MS = 60 * 60 * 1000;

export async function listRecentSignersSince(
  since: Date | null,
  db: any = null,
): Promise<RecentSignerEvent[]> {
  const client = db ?? getDefaultDb();
  const cutoff = since ?? new Date(Date.now() - SIXTY_MINUTES_MS);
  const rows = await client
    .select({
      id: signers.id,
      displayName: signers.displayName,
      locationText: signers.locationText,
      signedAt: signatures.signedAt,
    })
    .from(signatures)
    .innerJoin(signers, eq(signers.id, signatures.signerId))
    .where(and(gt(signatures.signedAt, cutoff), isNull(signers.softBannedAt)))
    .orderBy(desc(signatures.signedAt));
  return rows as RecentSignerEvent[];
}

export interface CommentRow {
  id: string;
  body: string;
  signerId: string;
  displayName: string;
  parentCommentId: string | null;
  createdAt: Date;
}

export async function countCommentsByAnchor(
  db: any,
  baseVersionId: string,
): Promise<Record<string, number>> {
  const rows = await db
    .select({
      anchorId: comments.anchorId,
    })
    .from(comments)
    .where(
      and(
        eq(comments.baseVersionId, baseVersionId),
        isNull(comments.hiddenAt),
      ),
    );
  const out: Record<string, number> = {};
  for (const r of rows) {
    if (!r.anchorId) continue;
    out[r.anchorId] = (out[r.anchorId] ?? 0) + 1;
  }
  return out;
}

export async function listCommentsForAnchor(
  db: any,
  baseVersionId: string,
  anchorId: string,
): Promise<CommentRow[]> {
  const rows = await db
    .select({
      id: comments.id,
      body: comments.body,
      signerId: comments.signerId,
      displayName: signers.displayName,
      parentCommentId: comments.parentCommentId,
      createdAt: comments.createdAt,
    })
    .from(comments)
    .innerJoin(signers, eq(signers.id, comments.signerId))
    .where(
      and(
        eq(comments.baseVersionId, baseVersionId),
        eq(comments.anchorId, anchorId),
        isNull(comments.hiddenAt),
      ),
    )
    .orderBy(asc(comments.createdAt));
  return rows as CommentRow[];
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

// ──────────────────────────────────────────────────────────────────────────────
// Proposed-edit queries (Phase 3)
// ──────────────────────────────────────────────────────────────────────────────

export interface ProposalRow {
  id: string;
  kind: "replace" | "insert_after" | "delete";
  targetAnchorId: string;
  newText: string | null;
  rationale: string | null;
  status: "pending" | "accepted" | "rejected" | "stale" | "published";
  proposerSignerId: string;
  displayName: string;
  upvoteCount: number;
  createdAt: Date;
  decidedAt: Date | null;
}

/**
 * Returns per-anchor counts of pending and accepted proposals for a given version.
 */
export async function countProposalsByAnchor(
  db: any,
  baseVersionId: string,
): Promise<Record<string, { pending: number; accepted: number }>> {
  const rows = await db
    .select({
      targetAnchorId: proposedEdits.targetAnchorId,
      status: proposedEdits.status,
    })
    .from(proposedEdits)
    .where(
      and(
        eq(proposedEdits.baseVersionId, baseVersionId),
        inArray(proposedEdits.status, ["pending", "accepted"]),
      ),
    );

  const out: Record<string, { pending: number; accepted: number }> = {};
  for (const r of rows) {
    const key = r.targetAnchorId;
    if (!out[key]) out[key] = { pending: 0, accepted: 0 };
    if (r.status === "pending") out[key].pending += 1;
    else if (r.status === "accepted") out[key].accepted += 1;
  }
  return out;
}

/**
 * Lists all pending and accepted proposals for a specific anchor, ordered oldest-first.
 */
export async function listProposalsByAnchor(
  db: any,
  baseVersionId: string,
  anchorId: string,
): Promise<ProposalRow[]> {
  const rows = await db
    .select({
      id: proposedEdits.id,
      kind: proposedEdits.kind,
      targetAnchorId: proposedEdits.targetAnchorId,
      newText: proposedEdits.newText,
      rationale: proposedEdits.rationale,
      status: proposedEdits.status,
      proposerSignerId: proposedEdits.proposerSignerId,
      displayName: signers.displayName,
      createdAt: proposedEdits.createdAt,
      decidedAt: proposedEdits.decidedAt,
    })
    .from(proposedEdits)
    .innerJoin(signers, eq(signers.id, proposedEdits.proposerSignerId))
    .where(
      and(
        eq(proposedEdits.baseVersionId, baseVersionId),
        eq(proposedEdits.targetAnchorId, anchorId),
        inArray(proposedEdits.status, ["pending", "accepted"]),
      ),
    )
    .orderBy(asc(proposedEdits.createdAt));

  // Fetch upvote counts for each proposal
  const ids = rows.map((r: { id: string }) => r.id);
  const upvoteCounts: Record<string, number> = {};
  if (ids.length > 0) {
    const uvRows = await db
      .select({ proposalId: proposalUpvotes.proposalId })
      .from(proposalUpvotes)
      .where(inArray(proposalUpvotes.proposalId, ids));
    for (const uv of uvRows) {
      upvoteCounts[uv.proposalId] = (upvoteCounts[uv.proposalId] ?? 0) + 1;
    }
  }

  return rows.map((r: Omit<ProposalRow, "upvoteCount">) => ({
    ...r,
    upvoteCount: upvoteCounts[r.id] ?? 0,
  })) as ProposalRow[];
}

/**
 * Returns all accepted proposals for a given base version.
 * Used to compute the rendered state of /proposed.
 */
export async function getAcceptedProposalsForVersion(
  db: any,
  baseVersionId: string,
): Promise<ProposalRow[]> {
  const rows = await db
    .select({
      id: proposedEdits.id,
      kind: proposedEdits.kind,
      targetAnchorId: proposedEdits.targetAnchorId,
      newText: proposedEdits.newText,
      rationale: proposedEdits.rationale,
      status: proposedEdits.status,
      proposerSignerId: proposedEdits.proposerSignerId,
      displayName: signers.displayName,
      createdAt: proposedEdits.createdAt,
      decidedAt: proposedEdits.decidedAt,
    })
    .from(proposedEdits)
    .innerJoin(signers, eq(signers.id, proposedEdits.proposerSignerId))
    .where(
      and(
        eq(proposedEdits.baseVersionId, baseVersionId),
        eq(proposedEdits.status, "accepted"),
      ),
    )
    .orderBy(asc(proposedEdits.createdAt));

  const ids = rows.map((r: { id: string }) => r.id);
  const upvoteCounts: Record<string, number> = {};
  if (ids.length > 0) {
    const uvRows = await db
      .select({ proposalId: proposalUpvotes.proposalId })
      .from(proposalUpvotes)
      .where(inArray(proposalUpvotes.proposalId, ids));
    for (const uv of uvRows) {
      upvoteCounts[uv.proposalId] = (upvoteCounts[uv.proposalId] ?? 0) + 1;
    }
  }

  return rows.map((r: Omit<ProposalRow, "upvoteCount">) => ({
    ...r,
    upvoteCount: upvoteCounts[r.id] ?? 0,
  })) as ProposalRow[];
}

/**
 * Lists all pending proposals across all anchors for admin review.
 */
export async function listPendingProposalsForVersion(
  db: any,
  baseVersionId: string,
): Promise<ProposalRow[]> {
  const rows = await db
    .select({
      id: proposedEdits.id,
      kind: proposedEdits.kind,
      targetAnchorId: proposedEdits.targetAnchorId,
      newText: proposedEdits.newText,
      rationale: proposedEdits.rationale,
      status: proposedEdits.status,
      proposerSignerId: proposedEdits.proposerSignerId,
      displayName: signers.displayName,
      createdAt: proposedEdits.createdAt,
      decidedAt: proposedEdits.decidedAt,
    })
    .from(proposedEdits)
    .innerJoin(signers, eq(signers.id, proposedEdits.proposerSignerId))
    .where(
      and(
        eq(proposedEdits.baseVersionId, baseVersionId),
        eq(proposedEdits.status, "pending"),
      ),
    )
    .orderBy(asc(proposedEdits.createdAt));

  const ids = rows.map((r: { id: string }) => r.id);
  const upvoteCounts: Record<string, number> = {};
  if (ids.length > 0) {
    const uvRows = await db
      .select({ proposalId: proposalUpvotes.proposalId })
      .from(proposalUpvotes)
      .where(inArray(proposalUpvotes.proposalId, ids));
    for (const uv of uvRows) {
      upvoteCounts[uv.proposalId] = (upvoteCounts[uv.proposalId] ?? 0) + 1;
    }
  }

  return rows.map((r: Omit<ProposalRow, "upvoteCount">) => ({
    ...r,
    upvoteCount: upvoteCounts[r.id] ?? 0,
  })) as ProposalRow[];
}

// ──────────────────────────────────────────────────────────────────────────────
// Endorsement queries (Phase 4)
// ──────────────────────────────────────────────────────────────────────────────

export async function getMyEndorsementForVersion(
  db: any,
  signerId: string,
  baseVersionId: string,
): Promise<{ id: string } | null> {
  const rows = await db
    .select({ id: endorsements.id })
    .from(endorsements)
    .where(and(eq(endorsements.signerId, signerId), eq(endorsements.baseVersionId, baseVersionId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function countEndorsersForVersion(
  db: any,
  baseVersionId: string,
): Promise<number> {
  const rows = await db
    .select({ value: count() })
    .from(endorsements)
    .where(eq(endorsements.baseVersionId, baseVersionId));
  return Number(rows[0]?.value ?? 0);
}

export async function listEndorsersForVersion(
  db: any,
  baseVersionId: string,
): Promise<Array<{ signerId: string; displayName: string }>> {
  const rows = await db
    .select({ signerId: endorsements.signerId, displayName: signers.displayName })
    .from(endorsements)
    .innerJoin(signers, eq(signers.id, endorsements.signerId))
    .where(eq(endorsements.baseVersionId, baseVersionId));
  return rows;
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
