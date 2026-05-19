import { eq, count, desc, gt, and, isNull, asc } from "drizzle-orm";
import { versions, signatures, signers, comments } from "./schema";

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
