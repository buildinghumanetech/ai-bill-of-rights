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
  /** When they signed `version` — the most recent version they affirmed. */
  signedAt: string;
  version: string;
  requestedVersion: string;
  /** Their first-ever signature, for "signing since" copy. */
  firstSignedAt: string;
  /**
   * The version `firstSignedAt` belongs to. Kept alongside the date because
   * pairing the FIRST date with the LATEST version in one sentence states
   * something untrue: someone who signed v0.0.1 in January and v0.0.2 in May
   * would read "signing since January (v0.0.2)", a date they did not sign that
   * version on.
   */
  firstVersion: string;
}

/**
 * They have signed, but a different version, and the one being asked about is
 * NOT open for signing — either it is superseded by what they signed (viewing
 * /v/0.0.1 after signing 0.1.0) or it is simply an archived version nobody can
 * sign any more.
 *
 * Distinct from `signed-earlier` because there is nothing to offer: a re-affirm
 * button here would call `reaffirmSignature`, which refuses any non-current
 * version, so it could only ever fail. Copy about "what's been added since you
 * signed" would also be wrong or backwards.
 */
export interface SignedOtherStatus {
  state: "signed-other";
  displayName: string;
  verificationMethod: "email" | "sms";
  signedAt: string;
  version: string;
  requestedVersion: string;
}

/**
 * They have signed, and the version being asked about has NO ROW AT ALL.
 *
 * Kept apart from `signed-other` because the honest copy differs. `sync-versions`
 * is a manual post-deploy step (see AGENTS.md and README "Post-deploy steps"),
 * and `SignModal` hardcodes the version constant — so a deploy whose constant is
 * ahead of the database, or the window during the unsync/re-sync remedy, leaves
 * the requested version genuinely absent. Telling those people the version is
 * "no longer open for signing" would be a false statement about the version the
 * site is actively campaigning for.
 *
 * The UI for this state says nothing about the requested version at all, which
 * is the only claim that stays true whatever the cause.
 */
export interface SignedVersionUnknownStatus {
  state: "signed-version-unknown";
  displayName: string;
  verificationMethod: "email" | "sms";
  signedAt: string;
  version: string;
  requestedVersion: string;
}

export type SignerSignatureStatus =
  | { state: "not-signed" }
  | SignedStatus
  | SignedEarlierStatus
  | SignedOtherStatus
  | SignedVersionUnknownStatus;

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
  const common = {
    displayName: signer.displayName,
    verificationMethod: signer.verificationMethod,
    signedAt: toIso(latest.signedAt),
    version: latest.version,
    requestedVersion: versionString,
  };

  // `signed-earlier` means "there is something here to re-affirm", so it hinges
  // on whether the requested version is OPEN FOR SIGNING — i.e. is_current —
  // not merely on whether it is newer than what they signed. An archived
  // intermediate version (signed 0.0.1, asking about a published-and-archived
  // 0.0.2) is newer AND unsignable: `reaffirmSignature` refuses every
  // non-current version, so offering the button there guarantees a failure.
  //
  // Three outcomes, not two: no row, an archived row, and a current row.
  const requested = await db
    .select({ isCurrent: versions.isCurrent })
    .from(versions)
    .where(eq(versions.version, versionString))
    .limit(1);

  // No row at all is NOT the same as an archived row — see
  // SignedVersionUnknownStatus. Collapsing them tells people the version the
  // site is campaigning for is closed, which is both false and unactionable.
  if (requested.length === 0) {
    // An operational fault, not a user one: the deployed version constant is
    // ahead of the database. Say so where operators look, since the UI
    // deliberately does not.
    console.warn(
      `[signature-status] no versions row for ${versionString} — is sync-versions pending?`,
    );
    return { ...common, state: "signed-version-unknown" };
  }

  if (!requested[0].isCurrent) {
    return { ...common, state: "signed-other" };
  }

  return {
    ...common,
    state: "signed-earlier",
    firstSignedAt: toIso(earliest.signedAt),
    firstVersion: earliest.version,
  };
}
