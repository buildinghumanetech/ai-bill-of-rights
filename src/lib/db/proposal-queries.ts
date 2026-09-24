import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { proposedEdits, proposalUpvotes, comments, signers } from "./schema";
import { getDb } from "./lazy";
import type { Db } from "./types";

export interface ProposedRight {
  id: string;
  title: string;
  body: string;
  rationale: string | null;
  pullQuote: string | null;
  status: "pending" | "accepted" | "rejected" | "stale" | "published";
  createdAt: Date;
  proposerSignerId: string;
  proposerDisplayName: string;
  proposerAffiliation: string | null;
  upvoteCount: number;
  commentCount: number;
  /** Whether the viewer has endorsed it. Always false for signed-out viewers. */
  viewerHasUpvoted: boolean;
  hiddenAt: Date | null;
  hiddenReason: string | null;
  /** Licence granted on submission; null means none was recorded. */
  license: string | null;
  licenseGrantedAt: Date | null;
}

/**
 * The public queue behind /propose.
 *
 * Counts come from correlated subqueries rather than joins: a proposal has two
 * independent one-to-many children (upvotes, comments), and joining both in
 * one statement multiplies the rows and inflates each count by the other's
 * cardinality. Two subqueries are the boring correct form here, and both are
 * index-backed (`proposal_upvotes_proposal_idx`, and comments' proposal_id FK).
 *
 * `includeHidden` is for the admin queue only. The public page must never pass
 * it: hidden covers both author withdrawals and moderation removals.
 */
export async function listProposedRights(
  db: Db = getDb(),
  opts: {
    baseVersionId: string;
    viewerSignerId?: string | null;
    includeHidden?: boolean;
    statuses?: Array<ProposedRight["status"]>;
  },
): Promise<ProposedRight[]> {
  const viewerId = opts.viewerSignerId ?? null;

  const upvoteCount = sql<number>`(
    select count(*)::int from ${proposalUpvotes}
    where ${proposalUpvotes.proposalId} = ${proposedEdits.id}
  )`;

  const commentCount = sql<number>`(
    select count(*)::int from ${comments}
    where ${comments.proposalId} = ${proposedEdits.id}
      and ${comments.hiddenAt} is null
  )`;

  // Parameterised, not interpolated: viewerId comes from the session but this
  // is a query builder, not a template, and the `${}` inside sql`` binds.
  const viewerHasUpvoted = viewerId
    ? sql<boolean>`exists (
        select 1 from ${proposalUpvotes}
        where ${proposalUpvotes.proposalId} = ${proposedEdits.id}
          and ${proposalUpvotes.signerId} = ${viewerId}
      )`
    : sql<boolean>`false`;

  const conditions = [
    eq(proposedEdits.baseVersionId, opts.baseVersionId),
    eq(proposedEdits.kind, "new_article"),
  ];
  if (!opts.includeHidden) conditions.push(isNull(proposedEdits.hiddenAt));
  if (opts.statuses?.length) {
    conditions.push(
      sql`${proposedEdits.status} in (${sql.join(
        opts.statuses.map((s) => sql`${s}`),
        sql`, `,
      )})`,
    );
  }

  const rows = await db
    .select({
      id: proposedEdits.id,
      title: proposedEdits.title,
      body: proposedEdits.newText,
      rationale: proposedEdits.rationale,
      pullQuote: proposedEdits.pullQuote,
      status: proposedEdits.status,
      createdAt: proposedEdits.createdAt,
      proposerSignerId: proposedEdits.proposerSignerId,
      proposerDisplayName: signers.displayName,
      proposerAffiliation: signers.affiliation,
      hiddenAt: proposedEdits.hiddenAt,
      hiddenReason: proposedEdits.hiddenReason,
      license: proposedEdits.license,
      licenseGrantedAt: proposedEdits.licenseGrantedAt,
      upvoteCount,
      commentCount,
      viewerHasUpvoted,
    })
    .from(proposedEdits)
    .innerJoin(signers, eq(signers.id, proposedEdits.proposerSignerId))
    .where(and(...conditions))
    // Most-supported first, newest as the tiebreak so a fresh proposal with no
    // endorsements yet still sits above an equally-unsupported older one and
    // gets its turn at the top of the list.
    .orderBy(desc(upvoteCount), desc(proposedEdits.createdAt));

  return rows.map((r) => ({
    ...r,
    title: r.title ?? "(untitled)",
    body: r.body ?? "",
    upvoteCount: Number(r.upvoteCount ?? 0),
    commentCount: Number(r.commentCount ?? 0),
    viewerHasUpvoted: Boolean(r.viewerHasUpvoted),
  }));
}

export async function getProposedRight(
  db: Db = getDb(),
  proposalId: string,
): Promise<ProposedRight | null> {
  const rows = await db
    .select({
      baseVersionId: proposedEdits.baseVersionId,
    })
    .from(proposedEdits)
    .where(eq(proposedEdits.id, proposalId))
    .limit(1);
  if (rows.length === 0) return null;
  const all = await listProposedRights(db, {
    baseVersionId: rows[0].baseVersionId,
    includeHidden: true,
  });
  return all.find((p) => p.id === proposalId) ?? null;
}
