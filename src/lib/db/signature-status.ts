import { asc, desc, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { TablesRelationalConfig } from "drizzle-orm/relations";
import { signatures, versions } from "./schema";

type AnyDb = PgDatabase<PgQueryResultHKT, Record<string, unknown>, TablesRelationalConfig>;

/**
 * The person has a signature against the version being asked about.
 */
export interface SignedStatus {
  state: "signed";
  displayName: string;
  verificationMethod: "email" | "sms";
  signedAt: string; // ISO so it crosses the server/client boundary cleanly
  version: string;
}

/**
 * The person has signed the Bill of Rights, but against a DIFFERENT version
 * than the one being asked about — the normal state for everyone who signed
 * before a new version was published.
 *
 * This is deliberately not collapsed into "not-signed". Signatures are scoped
 * to the version row they were made against (`signatures` is unique on
 * (signer_id, version_id)), so publishing a new version would otherwise make
 * every existing signer read as a stranger and be handed a blank sign form —
 * even though every public count and list still includes them. Surfacing this
 * as its own state lets the UI acknowledge the signature it already has and
 * ask for a re-affirmation of the new text, rather than pretending there is
 * nothing there.
 *
 * `version` is the version they actually signed; `requestedVersion` is the one
 * that was asked about.
 */
export interface SignedEarlierStatus {
  state: "signed-earlier";
  displayName: string;
  verificationMethod: "email" | "sms";
  signedAt: string;
  version: string;
  requestedVersion: string;
  /** Their first-ever signature, for "signing since" copy. */
  firstSignedAt: string;
}

export type SignerSignatureStatus =
  | { state: "not-signed" }
  | SignedStatus
  | SignedEarlierStatus;

interface SignerLike {
  id: string;
  displayName: string;
  verificationMethod: "email" | "sms";
}

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

/**
 * Resolve what a given signer's relationship is to `versionString`.
 *
 * Reads every signature the person owns rather than filtering to the requested
 * version, because "signed something else" and "signed nothing" are different
 * answers and only the unfiltered read can tell them apart. A signer has at
 * most one row per version, so this stays a handful of rows in practice.
 */
export async function resolveSignatureStatus(
  db: AnyDb,
  signer: SignerLike,
  versionString: string,
): Promise<SignerSignatureStatus> {
  const rows = await db
    .select({
      signedAt: signatures.signedAt,
      version: versions.version,
    })
    .from(signatures)
    .innerJoin(versions, eq(versions.id, signatures.versionId))
    .where(eq(signatures.signerId, signer.id))
    // Total order: signed_at alone ties for admin/bulk-created rows and
    // backfills, and an undefined order here would make the reported version
    // flip between requests for the same person.
    .orderBy(desc(signatures.signedAt), asc(signatures.id));

  if (rows.length === 0) return { state: "not-signed" };

  const exact = rows.find((r) => r.version === versionString);
  if (exact) {
    return {
      state: "signed",
      displayName: signer.displayName,
      verificationMethod: signer.verificationMethod,
      signedAt: toIso(exact.signedAt),
      version: exact.version,
    };
  }

  // Most recent signature is what they most recently affirmed, so that is the
  // one worth showing them. rows is already newest-first.
  const latest = rows[0];
  const earliest = rows[rows.length - 1];
  return {
    state: "signed-earlier",
    displayName: signer.displayName,
    verificationMethod: signer.verificationMethod,
    signedAt: toIso(latest.signedAt),
    version: latest.version,
    requestedVersion: versionString,
    firstSignedAt: toIso(earliest.signedAt),
  };
}
