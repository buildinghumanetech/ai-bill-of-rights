"use server";

import { and, eq, exists, inArray } from "drizzle-orm";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { invitations, signatures, signers } from "@/lib/db/schema";
import { signInvitation } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/send";
import { homeShareUrl, signerShareLink } from "@/lib/share/urls";
import { getOrCreateShareSlug } from "@/lib/share/short-links";
import { sha256Hex } from "@/lib/consent/hash";

let _db: any | null = null;
function getDb() {
  if (!_db) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _db = require("@/lib/db").db;
  }
  return _db;
}

export interface InvitationResult {
  /** Addresses emailed by this call. */
  sent: string[];
  /** Addresses not emailed, and why. */
  skipped: { email: string; reason: "already-invited" | "already-signed" }[];
  /** Addresses whose send failed (they were NOT recorded, so a later retry may send). */
  failed: string[];
  error?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAILS_PER_REQUEST = 25;

/**
 * The key an address is remembered under in `invitations`. Only the hash is
 * stored — the invitee never agreed to us keeping their address. Callers pass
 * addresses already trimmed and lowercased; normalising again here keeps the
 * hash stable if that ever changes.
 */
function invitationHash(email: string): string {
  return sha256Hex(email.trim().toLowerCase());
}

/**
 * Which of `emails` (normalised) belong to someone who has already signed.
 *
 * Signers' addresses live in Clerk, not in our database, so: ask Clerk which
 * users own these addresses, map them to signer rows by clerk_user_id, and
 * count a signer only if they have at least one signature (an account alone is
 * not a signature). A Clerk outage must not block invitations, so any failure
 * here is logged and treated as "nobody has signed".
 */
async function alreadySignedEmails(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- same untyped drizzle client as getDb() above
  db: any,
  emails: string[],
): Promise<Set<string>> {
  const signed = new Set<string>();
  try {
    const clerk = await clerkClient();
    const { data: users } = await clerk.users.getUserList({
      emailAddress: emails,
      limit: 100,
    });
    const wanted = new Set(emails);
    const emailsByClerkId = new Map<string, string[]>();
    for (const u of users) {
      const owned = (u.emailAddresses ?? [])
        .map((e) => e.emailAddress.trim().toLowerCase())
        .filter((e) => wanted.has(e));
      if (owned.length > 0) emailsByClerkId.set(u.id, owned);
    }
    if (emailsByClerkId.size === 0) return signed;

    const rows: { clerkUserId: string }[] = await db
      .select({ clerkUserId: signers.clerkUserId })
      .from(signers)
      .where(
        and(
          inArray(signers.clerkUserId, [...emailsByClerkId.keys()]),
          exists(
            db
              .select({ id: signatures.id })
              .from(signatures)
              .where(eq(signatures.signerId, signers.id)),
          ),
        ),
      );
    for (const r of rows) {
      for (const e of emailsByClerkId.get(r.clerkUserId) ?? []) signed.add(e);
    }
  } catch (err) {
    console.error("[invite] already-signed lookup failed; not blocking", err);
    signed.clear();
  }
  return signed;
}

/**
 * Email each address at most ONCE, ever, across every inviter.
 *
 * The guarantee lives in `invitations.email_hash UNIQUE`: an address is
 * claimed with INSERT ... ON CONFLICT DO NOTHING RETURNING, and only the call
 * whose insert returned a row sends. Two concurrent requests for the same
 * address therefore cannot both email it. A failed send releases its claim so
 * a later attempt can try again; nothing ever re-sends a delivered invitation.
 */
export async function sendInvitationsAction(
  emails: string[],
): Promise<InvitationResult> {
  const { userId } = await auth();
  if (!userId) {
    return {
      sent: [],
      skipped: [],
      failed: [],
      error: "You must be signed in to invite.",
    };
  }

  const db = getDb();

  // Look up the inviter's signer row so we can include their public page URL.
  const rows = await db
    .select()
    .from(signers)
    .where(eq(signers.clerkUserId, userId))
    .limit(1);
  if (rows.length === 0) {
    return {
      sent: [],
      skipped: [],
      failed: [],
      error: "Sign the document before inviting others.",
    };
  }
  const inviter = rows[0];

  const cleaned = Array.from(
    new Set(
      emails
        .map((e) => e.trim().toLowerCase())
        .filter((e) => EMAIL_RE.test(e)),
    ),
  ).slice(0, MAX_EMAILS_PER_REQUEST);

  if (cleaned.length === 0) {
    return {
      sent: [],
      skipped: [],
      failed: [],
      error: "No valid email addresses provided.",
    };
  }

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://ai-for-people.org";
  // Both links go to the invitee — a third party — so both carry the inviter's
  // `?ref=` and the `invite` channel. Untagged, a personally-invited friend who
  // clicks through and signs is attributed to nobody and lands in no channel
  // bucket, while the modal has already reported `share_clicked{invite}`: the
  // funnel reads "high share volume, zero conversions" as a pure artifact.
  //
  // The inviter's page goes out as their short link when they have one; it
  // redirects with ?ref=, so attribution is the same. Never throws — null
  // (e.g. migration 0014 not applied) means the long tagged link.
  const inviterSlug = await getOrCreateShareSlug(db, inviter.id);
  const tpl = signInvitation({
    inviterName: inviter.displayName,
    inviterPageUrl: signerShareLink(siteUrl, inviter.id, inviterSlug, "invite"),
    readItUrl: homeShareUrl(siteUrl, inviter.id, "invite"),
  });

  const signed = await alreadySignedEmails(db, cleaned);

  // Per-address outcome, kept by index so the result lists read in the order
  // the caller typed them rather than in send-completion order.
  type Outcome =
    | { kind: "sent" }
    | { kind: "failed" }
    | { kind: "skipped"; reason: "already-invited" | "already-signed" };
  const outcomes: Outcome[] = await Promise.all(
    cleaned.map(async (to): Promise<Outcome> => {
      if (signed.has(to)) return { kind: "skipped", reason: "already-signed" };

      const emailHash = invitationHash(to);
      let claimed: { id: string }[];
      try {
        claimed = await db
          .insert(invitations)
          .values({ emailHash, inviterSignerId: inviter.id })
          .onConflictDoNothing({ target: invitations.emailHash })
          .returning({ id: invitations.id });
      } catch (err) {
        console.error("[invite] could not record invitation", err);
        return { kind: "failed" };
      }
      if (claimed.length === 0) {
        return { kind: "skipped", reason: "already-invited" };
      }

      try {
        await sendEmail({ to, subject: tpl.subject, text: tpl.text });
        return { kind: "sent" };
      } catch (err) {
        console.error("[invite] send failed", err);
        // Release the claim so a later attempt may send. If even this fails
        // the address stays claimed — it will read as already-invited, which
        // errs on the side of not emailing someone twice.
        try {
          await db.delete(invitations).where(eq(invitations.id, claimed[0].id));
        } catch (releaseErr) {
          console.error("[invite] could not release invitation claim", releaseErr);
        }
        return { kind: "failed" };
      }
    }),
  );

  const result: InvitationResult = { sent: [], skipped: [], failed: [] };
  outcomes.forEach((o, i) => {
    const email = cleaned[i];
    if (o.kind === "sent") result.sent.push(email);
    else if (o.kind === "failed") result.failed.push(email);
    else result.skipped.push({ email, reason: o.reason });
  });
  return result;
}
