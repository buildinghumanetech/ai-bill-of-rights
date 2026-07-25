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

/**
 * Machine-readable reason a delete did not happen. Callers MUST branch on this
 * rather than on `refusedBecause`: that field is display text, and matching it
 * as a sentinel means any reword silently changes control flow — a successful
 * dry run turning into an error exit, for instance.
 */
export type UnsyncRefusalCode =
  | "not_found"
  | "referenced"
  | "current"
  | "dry_run";

export interface UnsyncReport {
  version: string;
  found: boolean;
  isCurrent: boolean;
  /** Rows pointing at this version, by table. Any non-zero blocks deletion. */
  dependents: Record<string, number>;
  deleted: boolean;
  /** Why the delete was refused, when it was. Display only — see the code. */
  refusedBecause?: string;
  refusedCode?: UnsyncRefusalCode;
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
 * Refuses when anything references it — signatures, comments, proposed edits,
 * endorsements, attestations, or another version claiming it as a parent. A
 * version people have actually signed or discussed is not a draft, and its
 * text is not yours to change. No option overrides that.
 *
 * Also refuses when the version is `is_current`, but that one IS overridable
 * via `allowCurrent`, and has to be: `sync-versions` sets `isCurrent` from
 * `versions.json`'s `current`, so the version being actively drafted is
 * normally the current one — meaning the frozen-draft case this function
 * exists for would otherwise always be refused. "Current but referenced by
 * nothing" is precisely a frozen draft. Deleting it leaves the database with
 * no current version until the next `sync-versions` re-inserts it, which is
 * why the override is explicit rather than automatic.
 */
export async function unsyncVersion(
  // Same loose db type the rest of src/lib/db uses, so callers can pass either
  // the production client or a pglite test db.
  db: DbLike,
  versionString: string,
  opts: { dryRun?: boolean; allowCurrent?: boolean } = {},
): Promise<UnsyncReport> {
  // Defaults to a DRY RUN. This function deletes a row that pages render from,
  // and `allowCurrent` makes the current version reachable — so the obvious way
  // to write the new call, `unsyncVersion(db, v, { allowCurrent: true })`, must
  // not silently be a destructive one. Callers opt in with `dryRun: false`.
  const dryRun = opts.dryRun ?? true;

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
      refusedCode: "not_found",
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

  // Dependents are checked FIRST because that, not is_current, is the real
  // safety property: a version somebody has signed or discussed is never a
  // draft, regardless of any override the caller passed.
  if (total > 0) {
    const detail = Object.entries(dependents)
      .filter(([, n]) => n > 0)
      .map(([t, n]) => `${t}=${n}`)
      .join(", ");
    return {
      ...base,
      deleted: false,
      refusedBecause: `version is referenced by other rows (${detail}) — it is in use, not a draft`,
      refusedCode: "referenced",
    };
  }
  if (row.isCurrent && !opts.allowCurrent) {
    return {
      ...base,
      deleted: false,
      refusedBecause:
        "this version is marked current. Nothing references it, so it is a " +
        "frozen draft and safe to clear — re-run with allowCurrent (CLI: " +
        "--allow-current). The database will briefly have NO current version; " +
        "run `pnpm sync-versions` straight afterwards to re-insert it from disk",
      refusedCode: "current",
    };
  }
  if (dryRun) {
    return {
      ...base,
      deleted: false,
      refusedBecause: "dry run",
      refusedCode: "dry_run",
    };
  }

  await db.delete(versions).where(eq(versions.id, id));
  return { ...base, deleted: true };
}
