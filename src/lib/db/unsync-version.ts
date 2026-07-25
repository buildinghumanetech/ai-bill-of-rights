import { eq } from "drizzle-orm";
import type { TablesRelationalConfig } from "drizzle-orm";
import type {
  PgColumn,
  PgDatabase,
  PgQueryResultHKT,
  PgTable,
} from "drizzle-orm/pg-core";
import {
  versions,
  signatures,
  comments,
  proposedEdits,
  endorsements,
  attestations,
} from "./schema";

/**
 * Both the production neon client and the pglite test db extend PgDatabase.
 * The schema type parameter is left open so either concrete client assigns;
 * pinning it would reject one or the other.
 */
type DbLike = PgDatabase<
  PgQueryResultHKT,
  Record<string, unknown>,
  TablesRelationalConfig
>;

export interface UnsyncReport {
  version: string;
  found: boolean;
  isCurrent: boolean;
  /** Rows pointing at this version, by table. Any non-zero blocks deletion. */
  dependents: Record<string, number>;
  deleted: boolean;
  /** Why the delete was refused, when it was. */
  refusedBecause?: string;
}

/**
 * Delete an UNUSED version row so the next `sync-versions` re-inserts it from
 * the files on disk.
 *
 * Why this exists: `syncVersions` hashes a version's markdown and throws if an
 * already-synced version's text changes — published documents are immutable.
 * That guard also fires on a version that is still being drafted, once any
 * deploy (including a Vercel *preview*, which syncs to the dev Neon branch) has
 * synced it. Editing the draft after that point breaks every subsequent build
 * with a hash mismatch until the stale row is cleared. This clears it.
 *
 * Refuses when the version is current, or when anything references it —
 * signatures, comments, proposed edits, endorsements, attestations, or another
 * version claiming it as a parent. A version people have actually signed or
 * discussed is not a draft, and its text is not yours to change.
 */
export async function unsyncVersion(
  // Same loose db type the rest of src/lib/db uses, so callers can pass either
  // the production client or a pglite test db.
  db: DbLike,
  versionString: string,
  opts: { dryRun?: boolean } = {},
): Promise<UnsyncReport> {
  const rows = await db
    .select()
    .from(versions)
    .where(eq(versions.version, versionString))
    .limit(1);

  if (rows.length === 0) {
    return {
      version: versionString,
      found: false,
      isCurrent: false,
      dependents: {},
      deleted: false,
      refusedBecause: "no such version row",
    };
  }

  const row = rows[0];
  const id = row.id as string;

  const countWhere = async (
    table: PgTable,
    column: PgColumn,
  ): Promise<number> => {
    const found = await db.select().from(table).where(eq(column, id));
    return found.length;
  };

  const dependents: Record<string, number> = {
    signatures: await countWhere(signatures, signatures.versionId),
    comments: await countWhere(comments, comments.baseVersionId),
    proposed_edits: await countWhere(proposedEdits, proposedEdits.baseVersionId),
    proposed_edits_published_in: await countWhere(
      proposedEdits,
      proposedEdits.publishedInVersionId,
    ),
    endorsements: await countWhere(endorsements, endorsements.baseVersionId),
    endorsements_converted_to: await countWhere(
      endorsements,
      endorsements.convertedToVersionId,
    ),
    attestations: await countWhere(attestations, attestations.versionId),
    child_versions: await countWhere(versions, versions.parentVersionId),
  };

  const total = Object.values(dependents).reduce((a, b) => a + b, 0);

  const base = {
    version: versionString,
    found: true,
    isCurrent: Boolean(row.isCurrent),
    dependents,
  };

  if (row.isCurrent) {
    return {
      ...base,
      deleted: false,
      refusedBecause:
        "this version is marked current — publish a different version first",
    };
  }
  if (total > 0) {
    const detail = Object.entries(dependents)
      .filter(([, n]) => n > 0)
      .map(([t, n]) => `${t}=${n}`)
      .join(", ");
    return {
      ...base,
      deleted: false,
      refusedBecause: `version is referenced by other rows (${detail}) — it is in use, not a draft`,
    };
  }
  if (opts.dryRun) {
    return { ...base, deleted: false, refusedBecause: "dry run" };
  }

  await db.delete(versions).where(eq(versions.id, id));
  return { ...base, deleted: true };
}
