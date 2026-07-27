"use server";

import { eq } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";
import { signers } from "@/lib/db/schema";
import { signInvitation } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/send";
import { homeShareUrl, signerShareUrl } from "@/lib/share/urls";

let _db: any | null = null;
function getDb() {
  if (!_db) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _db = require("@/lib/db").db;
  }
  return _db;
}

export interface InvitationResult {
  sent: number;
  failed: string[];
  error?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAILS_PER_REQUEST = 25;

export async function sendInvitationsAction(
  emails: string[],
): Promise<InvitationResult> {
  const { userId } = await auth();
  if (!userId) {
    return { sent: 0, failed: emails, error: "You must be signed in to invite." };
  }

  // Look up the inviter's signer row so we can include their public page URL.
  const rows = await getDb()
    .select()
    .from(signers)
    .where(eq(signers.clerkUserId, userId))
    .limit(1);
  if (rows.length === 0) {
    return {
      sent: 0,
      failed: emails,
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
    return { sent: 0, failed: [], error: "No valid email addresses provided." };
  }

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://ai-for-people.org";
  // Both links go to the invitee — a third party — so both carry the inviter's
  // `?ref=` and the `invite` channel. Untagged, a personally-invited friend who
  // clicks through and signs is attributed to nobody and lands in no channel
  // bucket, while the modal has already reported `share_clicked{invite}`: the
  // funnel reads "high share volume, zero conversions" as a pure artifact.
  const tpl = signInvitation({
    inviterName: inviter.displayName,
    inviterPageUrl: signerShareUrl(siteUrl, inviter.id, "invite"),
    siteUrl: homeShareUrl(siteUrl, inviter.id, "invite"),
  });

  const failed: string[] = [];
  let sent = 0;
  await Promise.all(
    cleaned.map(async (to) => {
      try {
        await sendEmail({ to, subject: tpl.subject, text: tpl.text });
        sent += 1;
      } catch (err) {
        console.error("[invite] send failed for", to, err);
        failed.push(to);
      }
    }),
  );

  return { sent, failed };
}
