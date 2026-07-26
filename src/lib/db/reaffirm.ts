import { eq } from "drizzle-orm";
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
 * Guards, all of which matter because this is reachable by any authenticated
 * user with a version string of their choosing:
 *
 * 1. **The signer must already have signed something.** This is a RE-affirm,
 *    not a first signature. Comment-only accounts get a `signers` row with
 *    zero signatures (`createSignerFromModal`), so without this check an
 *    authenticated commenter calling the action directly would become a public
 *    signatory of the bill — skipping the consent page and the `consent ===
 *    "yes"` gate that `submitSignAction` requires. First-time signing has its
 *    own flow; this is not a back door into it.
 * 2. **Only the current version may be affirmed.** Otherwise a caller could
 *    attach signature rows to any archived version row, which no UI offers and
 *    which would corrupt the per-version signer lists.
 * 3. **An existing signature short-circuits.** `recordSignature` inserts the
 *    consent record BEFORE the signature, so relying on the unique-constraint
 *    violation to detect a repeat means every repeat call leaves an orphan
 *    `consent_records` row behind. `consent_records` has no unique constraint,
 *    so a loop would write unbounded rows. Checking first makes the repeat a
 *    genuine no-op.
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

  // One read serves both the prior-signature requirement and the
  // already-signed-this-version short-circuit.
  const own = await db
    .select({ id: signatures.id, versionId: signatures.versionId })
    .from(signatures)
    .where(eq(signatures.signerId, input.signerId));

  if (own.length === 0) {
    // A comment-only account, or anyone who has never signed. Re-affirming
    // presupposes something to re-affirm; first-time signing goes through the
    // consent flow, not here.
    return {
      ok: false,
      error: "Sign the Bill of Rights first — there is nothing to re-affirm.",
    };
  }
  if (own.some((s) => s.versionId === versionRow.id)) {
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
    // The consent record is already written and neon-http has no transactions,
    // so nothing rolls it back for us. Clean it up by hand on EVERY error path,
    // not just the race — otherwise the orphan-consent-record leak this
    // function exists to close simply moves from the repeat path to the error
    // path. Best effort: if the delete itself fails, the original error is the
    // one worth reporting.
    try {
      await db.delete(consentRecords).where(eq(consentRecords.id, record.id));
    } catch {
      /* leave the orphan rather than mask the real failure */
    }
    // Lost a race with a concurrent submit (double-click, two tabs). The
    // signature row exists either way, so this is still the end state the
    // person wanted.
    const msg = err instanceof Error ? err.message : "";
    if (/duplicate key|unique/i.test(msg)) return { ok: true, created: false };
    throw err;
  }

  return { ok: true, created: true };
}
