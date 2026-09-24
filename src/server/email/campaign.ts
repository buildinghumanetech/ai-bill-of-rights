/**
 * Version emails: who gets one, and sending each signer a campaign at most
 * once. Driven by scripts/send-version-email.ts; nothing here runs on a
 * request. A plain module, not "use server", so none of it is POST-reachable.
 *
 * Every dependency with a side effect outside the database (looking up
 * addresses, sending) is passed in, so tests run it against pglite with fakes.
 */

import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, inArray, isNotNull } from "drizzle-orm";
import {
  consentRecords,
  emailSends,
  signatures,
  signers,
  versions,
} from "@/lib/db/schema";
import type { VersionLevel } from "@/lib/content/versions-index";
import { getSignatureNumber } from "@/lib/db/queries";
import type { EmailMessage } from "@/lib/email/send";
import { versionEmail } from "@/lib/email/version-email";
import {
  wantsVersionEmail,
  type NotificationPreference,
} from "@/lib/email/version-policy";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- same untyped drizzle client as @/lib/db/queries
type Db = any;

export const SENDER = "Erika Anderson <signature@ai-for-people.org>";
export const REPLY_TO = "erika@buildinghumanetech.com";
export const SITE_ORIGIN = "https://theaibill.org";

export interface CampaignSpec {
  /** Unique per email ever sent, e.g. "relaunch-0.1.0" or "version-0.2.0". */
  campaign: string;
  version: string;
  level: VersionLevel;
  publishedAt: string;
  summary: string;
  /**
   * The relaunch goes only to people who signed an earlier version and not
   * this one, and announces the new home. A version update goes to every
   * signer whose preference wants its level.
   */
  relaunch: boolean;
}

export interface Candidate {
  signerId: string;
  clerkUserId: string;
  displayName: string;
  preference: NotificationPreference;
  /** Most recent version they signed. */
  signedVersion: string;
}

export interface Contact {
  email: string;
  firstName: string | null;
}

export type ContactLookup = (c: Candidate[]) => Promise<Map<string, Contact>>;

export interface AudienceReport {
  signers: number;
  excluded: {
    signedThisVersion: number;
    anonymized: number;
    softBanned: number;
    preferenceNone: number;
    preferenceMajorOnMinorVersion: number;
    noEmail: number;
  };
  recipients: { major: number; minor: number; total: number };
}

export interface Recipient extends Candidate, Contact {}

/**
 * Everyone this campaign should reach, with the reasons the others don't.
 * Read-only.
 */
export async function buildAudience(
  db: Db,
  spec: CampaignSpec,
  lookupContacts: ContactLookup,
): Promise<{ recipients: Recipient[]; report: AudienceReport }> {
  const rows: Array<{
    signerId: string;
    clerkUserId: string;
    displayName: string;
    preference: NotificationPreference;
    softBannedAt: Date | null;
    version: string;
  }> = await db
    .select({
      signerId: signers.id,
      clerkUserId: signers.clerkUserId,
      displayName: signers.displayName,
      preference: signers.notificationPreference,
      softBannedAt: signers.softBannedAt,
      version: versions.version,
    })
    .from(signers)
    .innerJoin(signatures, eq(signatures.signerId, signers.id))
    .innerJoin(versions, eq(versions.id, signatures.versionId))
    .orderBy(asc(signers.id), desc(signatures.signedAt));

  const bySigner = new Map<string, { row: (typeof rows)[number]; versions: Set<string> }>();
  for (const row of rows) {
    const seen = bySigner.get(row.signerId);
    if (seen) seen.versions.add(row.version);
    // First row per signer is their most recent signature.
    else bySigner.set(row.signerId, { row, versions: new Set([row.version]) });
  }

  // Anonymizing revokes every consent record; that is the durable marker.
  const revoked: Array<{ signerId: string }> = await db
    .selectDistinct({ signerId: consentRecords.signerId })
    .from(consentRecords)
    .where(isNotNull(consentRecords.revokedAt));
  const anonymized = new Set(revoked.map((r) => r.signerId));

  const report: AudienceReport = {
    signers: bySigner.size,
    excluded: {
      signedThisVersion: 0,
      anonymized: 0,
      softBanned: 0,
      preferenceNone: 0,
      preferenceMajorOnMinorVersion: 0,
      noEmail: 0,
    },
    recipients: { major: 0, minor: 0, total: 0 },
  };

  const candidates: Candidate[] = [];
  for (const { row, versions: signed } of bySigner.values()) {
    if (spec.relaunch && signed.has(spec.version)) {
      report.excluded.signedThisVersion++;
    } else if (anonymized.has(row.signerId)) {
      report.excluded.anonymized++;
    } else if (row.softBannedAt) {
      report.excluded.softBanned++;
    } else if (!wantsVersionEmail(row.preference, spec.level)) {
      if (row.preference === "none") report.excluded.preferenceNone++;
      else report.excluded.preferenceMajorOnMinorVersion++;
    } else {
      candidates.push({
        signerId: row.signerId,
        clerkUserId: row.clerkUserId,
        displayName: row.displayName,
        preference: row.preference,
        signedVersion: row.version,
      });
    }
  }

  const contacts = await lookupContacts(candidates);
  const recipients: Recipient[] = [];
  for (const c of candidates) {
    const contact = contacts.get(c.signerId);
    if (!contact) {
      report.excluded.noEmail++;
      continue;
    }
    recipients.push({ ...c, ...contact });
    if (c.preference === "minor") report.recipients.minor++;
    else report.recipients.major++;
  }
  report.recipients.total = recipients.length;
  return { recipients, report };
}

export function newUnsubscribeToken(): string {
  return randomBytes(24).toString("base64url");
}

/** The email one recipient gets, with its one-click unsubscribe headers. */
export async function renderMessage(
  db: Db,
  spec: CampaignSpec,
  recipient: Recipient,
  unsubscribeToken: string,
  to: string = recipient.email,
): Promise<EmailMessage> {
  const unsubscribeUrl = `${SITE_ORIGIN}/unsubscribe/${unsubscribeToken}`;
  const signerNumber = await getSignatureNumber(recipient.signerId, db).catch(
    () => null,
  );
  const { subject, text, html } = versionEmail({
    firstName: recipient.firstName,
    signerNumber,
    version: spec.version,
    publishedAt: spec.publishedAt,
    summary: spec.summary,
    signedVersion:
      recipient.signedVersion !== spec.version ? recipient.signedVersion : null,
    relaunch: spec.relaunch,
    siteOrigin: SITE_ORIGIN,
    unsubscribeUrl,
  });
  return {
    to,
    from: SENDER,
    replyTo: REPLY_TO,
    subject,
    text,
    html,
    headers: {
      // RFC 8058 one-click: mail clients POST "List-Unsubscribe=One-Click"
      // to this URL, which /api/unsubscribe/<token> accepts.
      "List-Unsubscribe": `<${SITE_ORIGIN}/api/unsubscribe/${unsubscribeToken}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}

export interface SendResult {
  sent: number;
  skippedAlreadySent: number;
  failed: number;
  stoppedEarly: boolean;
}

/**
 * Sends the campaign in batches, claiming each (campaign, signer) row BEFORE
 * sending so nobody is ever emailed twice, even across reruns. A batch that
 * fails is released (Resend batches are all or nothing) so a rerun retries
 * it; a claim left behind by a crash is NOT retried. Stops once failures pass
 * `maxErrorRate` of what was attempted.
 */
export async function sendCampaign(
  db: Db,
  spec: CampaignSpec,
  recipients: Recipient[],
  sendBatch: (messages: EmailMessage[]) => Promise<void>,
  opts: { batchSize?: number; maxErrorRate?: number; pauseMs?: number } = {},
): Promise<SendResult> {
  const batchSize = opts.batchSize ?? 100;
  const maxErrorRate = opts.maxErrorRate ?? 0.02;
  const result: SendResult = { sent: 0, skippedAlreadySent: 0, failed: 0, stoppedEarly: false };

  for (let i = 0; i < recipients.length; i += batchSize) {
    const batch = recipients.slice(i, i + batchSize);
    const claimed: Array<{ recipient: Recipient; token: string }> = [];
    for (const recipient of batch) {
      const token = newUnsubscribeToken();
      const rows = await db
        .insert(emailSends)
        .values({ campaign: spec.campaign, signerId: recipient.signerId, unsubscribeToken: token })
        .onConflictDoNothing()
        .returning({ id: emailSends.id });
      if (rows.length === 0) result.skippedAlreadySent++;
      else claimed.push({ recipient, token });
    }
    if (claimed.length === 0) continue;

    const messages = await Promise.all(
      claimed.map(({ recipient, token }) => renderMessage(db, spec, recipient, token)),
    );
    const ids = claimed.map((c) => c.recipient.signerId);
    try {
      await sendBatch(messages);
      await db
        .update(emailSends)
        .set({ sentAt: new Date() })
        .where(and(eq(emailSends.campaign, spec.campaign), inArray(emailSends.signerId, ids)));
      result.sent += claimed.length;
    } catch (err) {
      console.error(`[campaign] batch starting at ${i} failed:`, err);
      await db
        .delete(emailSends)
        .where(and(eq(emailSends.campaign, spec.campaign), inArray(emailSends.signerId, ids)));
      result.failed += claimed.length;
    }

    const attempted = result.sent + result.failed;
    if (attempted > 0 && result.failed / attempted > maxErrorRate) {
      result.stoppedEarly = true;
      break;
    }
    if (opts.pauseMs) await new Promise((r) => setTimeout(r, opts.pauseMs));
  }
  return result;
}

/**
 * Sets the signer behind `token` to notification_preference 'none'.
 * Idempotent. Returns false for a token nobody was sent.
 */
export async function unsubscribeByToken(db: Db, token: string): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return false;
  const rows: Array<{ signerId: string }> = await db
    .select({ signerId: emailSends.signerId })
    .from(emailSends)
    .where(eq(emailSends.unsubscribeToken, token))
    .limit(1);
  const signerId = rows[0]?.signerId;
  if (!signerId) return false;
  await db
    .update(signers)
    .set({ notificationPreference: "none" })
    .where(eq(signers.id, signerId));
  return true;
}
