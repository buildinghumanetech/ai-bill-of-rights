import { eq, count, desc, gt, and, isNull, isNotNull, asc, sum, sql, inArray } from "drizzle-orm";
import { versions, signatures, signers, comments, attestations, commentVotes, commentReports, commentMentions } from "./schema";

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

export async function getSignatureNumber(
  signerId: string,
  db: any = getDefaultDb(),
): Promise<number> {
  // 1. Get the signer's signedAt timestamp
  const sigRow = await db
    .select({ signedAt: signatures.signedAt })
    .from(signatures)
    .where(eq(signatures.signerId, signerId))
    .orderBy(asc(signatures.signedAt))
    .limit(1);
  if (sigRow.length === 0) return 1;
  const signedAt = sigRow[0].signedAt;

  // 2. Count how many signatures exist at or before that timestamp
  const rows = await db
    .select({ value: count() })
    .from(signatures)
    .where(sql`${signatures.signedAt} <= ${signedAt}`);
  return Number(rows[0]?.value ?? 1);
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

// ─── Referrals ────────────────────────────────────────────────────────────────
// "Who did I bring in." Reads signers.referredBySignerId, which is stamped
// once at signup from the visitor's ref cookie (see src/lib/referral/).

/** How many people arrived through this signer's share links and signed up. */
export async function countReferralsBySigner(
  signerId: string,
  db: any = null,
): Promise<number> {
  const client = db ?? getDefaultDb();
  const rows = await client
    .select({ value: count() })
    .from(signers)
    .where(eq(signers.referredBySignerId, signerId));
  return Number(rows[0]?.value ?? 0);
}

export interface ReferredSigner {
  signerId: string;
  displayName: string;
  createdAt: Date;
  /** Null when they made an account but have not signed the bill. */
  signedAt: Date | null;
}

/**
 * The people this signer brought in, newest first. `signedAt` distinguishes
 * "signed because of you" from "made an account because of you" — a
 * re-engagement message wants the former.
 */
export async function listReferralsBySigner(
  signerId: string,
  db: any = null,
  opts: { limit?: number; offset?: number } = {},
): Promise<ReferredSigner[]> {
  const client = db ?? getDefaultDb();
  let q = client
    .select({
      signerId: signers.id,
      displayName: signers.displayName,
      createdAt: signers.createdAt,
      // A signer can hold several signatures (one per version); the earliest
      // is the one that represents "they signed because of you".
      signedAt: sql<Date | null>`min(${signatures.signedAt})`,
    })
    .from(signers)
    .leftJoin(signatures, eq(signatures.signerId, signers.id))
    .where(eq(signers.referredBySignerId, signerId))
    .groupBy(signers.id, signers.displayName, signers.createdAt)
    .orderBy(desc(signers.createdAt));

  if (opts.limit !== undefined) q = q.limit(opts.limit);
  if (opts.offset !== undefined) q = q.offset(opts.offset);

  return (await q) as ReferredSigner[];
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

export interface CommentWithSelection {
  id: string;
  body: string;
  signerId: string;
  displayName: string;
  parentCommentId: string | null;
  anchorId: string | null;
  selectedText: string | null;
  createdAt: Date;
}

export async function listCommentsForVersion(
  db: any,
  baseVersionId: string,
): Promise<CommentWithSelection[]> {
  const rows = await db
    .select({
      id: comments.id,
      body: comments.body,
      signerId: comments.signerId,
      displayName: signers.displayName,
      parentCommentId: comments.parentCommentId,
      anchorId: comments.anchorId,
      selectedText: comments.selectedText,
      createdAt: comments.createdAt,
    })
    .from(comments)
    .innerJoin(signers, eq(signers.id, comments.signerId))
    .where(
      and(
        eq(comments.baseVersionId, baseVersionId),
        isNull(comments.hiddenAt),
      ),
    )
    .orderBy(asc(comments.createdAt));
  return rows as CommentWithSelection[];
}

export async function listCommentsByAnchorForVersion(
  db: any,
  baseVersionId: string,
): Promise<Record<string, CommentWithSelection[]>> {
  const all = await listCommentsForVersion(db, baseVersionId);
  const out: Record<string, CommentWithSelection[]> = {};
  for (const c of all) {
    if (!c.anchorId) continue;
    if (!out[c.anchorId]) out[c.anchorId] = [];
    out[c.anchorId].push(c);
  }
  return out;
}

export interface AttestationListItem {
  id: string;
  orgName: string;
  productName: string;
  productUrl: string | null;
  version: string;
  claimedAt: Date;
}

export interface ThreadedComment {
  id: string;
  body: string;
  signerId: string;
  displayName: string;
  parentCommentId: string | null;
  anchorId: string | null;
  selectedText: string | null;
  createdAt: Date;
  score: number;
  myVote: 1 | -1 | null;
  /** Whether the current viewer has flagged this comment. */
  myReport: boolean;
  /**
   * Signers this comment actually notified — the `comment_mentions` rows, which
   * come from explicit typeahead picks. This is what drives mention highlighting,
   * so what a reader sees styled is exactly who received mail. See
   * `src/lib/comments/render-mentions.tsx`.
   */
  mentionedSignerIds: string[];
  replies: ThreadedComment[];
}

/** Sort siblings by score desc, then createdAt asc (HN-style). */
function sortSiblings(nodes: ThreadedComment[]): ThreadedComment[] {
  return nodes.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
}

/**
 * Build a threaded comment tree from a flat list.
 * Top-level nodes (parentCommentId == null) are roots.
 */
function buildTree(
  rows: Omit<ThreadedComment, "replies">[],
): ThreadedComment[] {
  const byId = new Map<string, ThreadedComment>();
  for (const r of rows) byId.set(r.id, { ...r, replies: [] });

  const roots: ThreadedComment[] = [];
  for (const node of byId.values()) {
    if (node.parentCommentId) {
      const parent = byId.get(node.parentCommentId);
      if (parent) {
        parent.replies.push(node);
      } else {
        // Parent is hidden/deleted — promote to root
        roots.push(node);
      }
    } else {
      roots.push(node);
    }
  }

  // Sort each level
  function sortRecursive(nodes: ThreadedComment[]): ThreadedComment[] {
    sortSiblings(nodes);
    for (const n of nodes) n.replies = sortRecursive(n.replies);
    return nodes;
  }
  return sortRecursive(roots);
}

export async function listThreadedCommentsForVersion(
  db: any,
  baseVersionId: string,
  viewerSignerId: string | null,
): Promise<ThreadedComment[]> {
  // 1. Fetch all visible comments joined to signers
  const commentRows = await db
    .select({
      id: comments.id,
      body: comments.body,
      signerId: comments.signerId,
      displayName: signers.displayName,
      parentCommentId: comments.parentCommentId,
      anchorId: comments.anchorId,
      selectedText: comments.selectedText,
      createdAt: comments.createdAt,
    })
    .from(comments)
    .innerJoin(signers, eq(signers.id, comments.signerId))
    .where(
      and(
        eq(comments.baseVersionId, baseVersionId),
        isNull(comments.hiddenAt),
      ),
    );

  if (commentRows.length === 0) return [];

  // 2. Aggregate scores from comment_votes
  const voteRows = await db
    .select({
      commentId: commentVotes.commentId,
      score: sql<number>`cast(coalesce(sum(${commentVotes.direction}), 0) as integer)`,
    })
    .from(commentVotes)
    .groupBy(commentVotes.commentId);

  const scoreMap = new Map<string, number>();
  for (const v of voteRows) scoreMap.set(v.commentId, Number(v.score));

  // 3. Fetch viewer's own votes
  const myVoteMap = new Map<string, 1 | -1>();
  if (viewerSignerId) {
    const myVotes = await db
      .select({ commentId: commentVotes.commentId, direction: commentVotes.direction })
      .from(commentVotes)
      .where(eq(commentVotes.signerId, viewerSignerId));
    for (const v of myVotes) myVoteMap.set(v.commentId, v.direction as 1 | -1);
  }

  // 4. Fetch viewer's own reports
  const myReportSet = new Set<string>();
  if (viewerSignerId) {
    const myReports = await db
      .select({ commentId: commentReports.commentId })
      .from(commentReports)
      .where(eq(commentReports.reporterSignerId, viewerSignerId));
    for (const r of myReports) myReportSet.add(r.commentId);
  }

  // 5. Fetch the mention rows for these comments. Scoped to the ids we already
  // hold rather than joined onto the comment query, so a comment mentioning
  // three people stays one row instead of three that then need collapsing.
  const mentionsByComment = new Map<string, string[]>();
  const mentionRows = await db
    .select({
      commentId: commentMentions.commentId,
      mentionedSignerId: commentMentions.mentionedSignerId,
    })
    .from(commentMentions)
    .where(inArray(commentMentions.commentId, commentRows.map((r: { id: string }) => r.id)));
  for (const m of mentionRows) {
    const list = mentionsByComment.get(m.commentId);
    if (list) list.push(m.mentionedSignerId);
    else mentionsByComment.set(m.commentId, [m.mentionedSignerId]);
  }

  // 6. Build tree
  const flat: Omit<ThreadedComment, "replies">[] = commentRows.map((r: any) => ({
    id: r.id,
    body: r.body,
    signerId: r.signerId,
    displayName: r.displayName,
    parentCommentId: r.parentCommentId,
    anchorId: r.anchorId,
    selectedText: r.selectedText,
    createdAt: r.createdAt,
    score: scoreMap.get(r.id) ?? 0,
    myVote: myVoteMap.get(r.id) ?? null,
    myReport: myReportSet.has(r.id),
    mentionedSignerIds: mentionsByComment.get(r.id) ?? [],
  }));

  return buildTree(flat);
}

export interface SignerForAdminPostAs {
  id: string;
  displayName: string;
}

/**
 * Returns all non-banned signers for the admin "post as" dropdown.
 * Sorted alphabetically by display_name.
 */
export async function listSignersForAdminPostAs(
  db: any,
): Promise<SignerForAdminPostAs[]> {
  const rows = await db
    .select({ id: signers.id, displayName: signers.displayName })
    .from(signers)
    .where(isNull(signers.softBannedAt))
    .orderBy(asc(signers.displayName));
  return rows as SignerForAdminPostAs[];
}

export interface SignerForMention {
  id: string;
  displayName: string;
}

/**
 * Returns all non-banned signers for the @mention typeahead.
 * Available to all signed-in users (not admin-only).
 * Sorted alphabetically by display_name.
 */
export async function listSignersForMention(
  db: any,
): Promise<SignerForMention[]> {
  const rows = await db
    .select({ id: signers.id, displayName: signers.displayName })
    .from(signers)
    .where(isNull(signers.softBannedAt))
    .orderBy(asc(signers.displayName));
  return rows as SignerForMention[];
}

export async function findThreadedCommentTree(
  db: any,
  rootCommentId: string,
  viewerSignerId: string | null,
): Promise<ThreadedComment | null> {
  // Fetch the root comment's baseVersionId first, then list the whole version tree
  // and find the root. This is simpler than a recursive CTE and fine for current scale.
  const rootRow = await db
    .select({ baseVersionId: comments.baseVersionId })
    .from(comments)
    .where(eq(comments.id, rootCommentId))
    .limit(1);
  if (rootRow.length === 0) return null;

  const tree = await listThreadedCommentsForVersion(db, rootRow[0].baseVersionId, viewerSignerId);
  return findCommentInTree(tree, rootCommentId);
}

/** Depth-first search for a comment in a threaded tree. */
export function findCommentInTree(
  tree: ThreadedComment[],
  id: string,
): ThreadedComment | null {
  for (const node of tree) {
    if (node.id === id) return node;
    const found = findCommentInTree(node.replies, id);
    if (found) return found;
  }
  return null;
}

/** Flatten a tree back to a list (DFS). */
export function flattenTree(tree: ThreadedComment[]): ThreadedComment[] {
  const out: ThreadedComment[] = [];
  function walk(nodes: ThreadedComment[]) {
    for (const n of nodes) {
      out.push(n);
      walk(n.replies);
    }
  }
  walk(tree);
  return out;
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

export interface AdminAttestationListItem {
  id: string;
  orgName: string;
  productName: string;
  productUrl: string | null;
  contactEmail: string;
  claimedAt: Date;
  emailVerifiedAt: Date | null;
  version: string;
  status: "pending" | "approved" | "hidden";
}

export async function listAllAttestationsForAdmin(
  db: any = null,
): Promise<AdminAttestationListItem[]> {
  const client = db ?? getDefaultDb();
  const rows = await client
    .select({
      id: attestations.id,
      orgName: attestations.orgName,
      productName: attestations.productName,
      productUrl: attestations.productUrl,
      contactEmail: attestations.contactEmail,
      claimedAt: attestations.claimedAt,
      emailVerifiedAt: attestations.emailVerifiedAt,
      published: attestations.published,
      hiddenAt: attestations.hiddenAt,
      manuallyApproved: attestations.manuallyApproved,
      version: versions.version,
    })
    .from(attestations)
    .innerJoin(versions, eq(versions.id, attestations.versionId))
    .orderBy(desc(attestations.claimedAt));

  return rows.map((r: any) => ({
    id: r.id,
    orgName: r.orgName,
    productName: r.productName,
    productUrl: r.productUrl,
    contactEmail: r.contactEmail,
    claimedAt: r.claimedAt,
    emailVerifiedAt: r.emailVerifiedAt,
    version: r.version,
    status: r.hiddenAt
      ? ("hidden" as const)
      : r.published || r.manuallyApproved
        ? ("approved" as const)
        : ("pending" as const),
  }));
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
