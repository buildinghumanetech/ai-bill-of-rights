import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { TablesRelationalConfig } from "drizzle-orm/relations";
import { consentRecords, signatures, versions } from "./schema";
import type { CapturedFields } from "@/lib/fingerprint/extract";

type AnyDb = PgDatabase<PgQueryResultHKT, Record<string, unknown>, TablesRelationalConfig>;

export interface ReaffirmInput {
  signerId: string;
  versionString: string;
  consentTextHash: string;
  capturedFields: CapturedFields;
}

export type ReaffirmResult =
  | { ok: true; created: boolean }
  | { ok: false; error: string };

/**
 * Record a signature for an existing signer against `versionString`, for the
 * "re-affirm" path used when someone who signed an earlier version wants their
 * name on the new one.
 *
 * Three guards that the naive version lacked, all of which matter because this
 * is reachable by any authenticated user with a version string of their
 * choosing:
 *
 * 1. **Only the current version may be affirmed.** Otherwise a caller could
 *    attach signature rows to any archived version row, which no UI offers and
 *    which would corrupt the per-version signer lists.
 * 2. **An existing signature short-circuits.** `recordSignature` inserts the
 *    consent record BEFORE the signature, so relying on the unique-constraint
 *    violation to detect a repeat means every repeat call leaves an orphan
 *    `consent_records` row behind. `consent_records` has no unique constraint,
 *    so a loop would write unbounded rows. Checking first makes the repeat a
 *    genuine no-op.
 * 3. **Writes are the caller's to rate limit** — see the action wrapper.
 *
 * Returns `created: false` when the person had already signed this version,
 * which is success from their point of view: the end state they asked for
 * already holds.
 */
export async function reaffirmSignature(
  db: AnyDb,
  input: ReaffirmInput,
): Promise<ReaffirmResult> {
  const versionRows = await db
    .select()
    .from(versions)
    .where(eq(versions.version, input.versionString))
    .limit(1);
  if (versionRows.length === 0) {
    return { ok: false, error: "Unknown version." };
  }
  const versionRow = versionRows[0];

  if (!versionRow.isCurrent) {
    // The client supplies the version string. Signing an archived version is
    // not something any surface offers, so treat it as a bad request rather
    // than quietly writing the row.
    return { ok: false, error: "That version is no longer open for signing." };
  }

  const already = await db
    .select({ id: signatures.id })
    .from(signatures)
    .where(
      and(
        eq(signatures.signerId, input.signerId),
        eq(signatures.versionId, versionRow.id),
      ),
    )
    .limit(1);
  if (already.length > 0) {
    return { ok: true, created: false };
  }

  const [record] = await db
    .insert(consentRecords)
    .values({
      signerId: input.signerId,
      consentTextHash: input.consentTextHash,
      capturedFields: input.capturedFields as unknown as object,
    })
    .returning({ id: consentRecords.id });

  try {
    await db.insert(signatures).values({
      signerId: input.signerId,
      versionId: versionRow.id,
      versionHashAtSigning: versionRow.markdownHash,
      consentRecordId: record.id,
    });
  } catch (err) {
    // Lost a race with a concurrent submit (double-click, two tabs). The row
    // exists either way, so this is still the end state the person wanted.
    const msg = err instanceof Error ? err.message : "";
    if (/duplicate key|unique/i.test(msg)) return { ok: true, created: false };
    throw err;
  }

  return { ok: true, created: true };
}
