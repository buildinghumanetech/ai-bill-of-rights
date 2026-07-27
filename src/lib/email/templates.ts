import { buildShareText } from "@/lib/share/share-text";
import {
  shareHrefs,
  withShareParams,
  type ShareChannel,
} from "@/lib/share/urls";

export function commentAccountCreated(opts: {
  displayName: string;
  siteUrl: string;
  accountUrl: string;
}): { subject: string; text: string } {
  return {
    subject: `Welcome to the AI Bill of Rights discussion`,
    text: `Hi ${opts.displayName},

You created an account to comment on the AI Bill of Rights working draft.

You can also sign the bill itself any time from your account page: ${opts.accountUrl}

— The AI Bill of Rights project
`,
  };
}

function getNextMilestone(current: number): number {
  const milestones = [50, 100, 250, 500, 1000, 2500, 5000, 10000];
  for (const m of milestones) {
    if (current < m) return m;
  }
  return Math.ceil(current / 5000) * 5000 + 5000;
}

export function signConfirmation(opts: {
  displayName: string;
  version: string;
  signerPageUrl: string;
  revokeUrl: string;
  signatureNumber?: number;
  totalSignatures?: number;
  /**
   * Signer id, so every SHARE link carries ?ref= attribution. Null degrades
   * to an untagged-but-still-channelled link rather than crediting whoever
   * happened to be in the URL before.
   *
   * It is deliberately not applied to the signer's own "view my signature"
   * links — see `ownPageUrl` below.
   *
   * There is deliberately no `whyISigned` param: this email is sent the
   * instant the signature lands, and the "why I signed" statement is captured
   * on the step AFTER that. It is null at send time for every signer, so a
   * param for it would be a promise the template can never keep.
   */
  signerId?: string | null;
}): { subject: string; text: string; html: string } {
  const sigNum = opts.signatureNumber ?? 1;
  const total = opts.totalSignatures ?? sigNum;
  const milestone = getNextMilestone(total);
  const firstName = opts.displayName.split(/\s+/)[0];

  const ref = opts.signerId ?? null;
  const shareUrlFor = (channel: ShareChannel) =>
    withShareParams(opts.signerPageUrl, { ref, channel });
  const shareTextFor = (channel: ShareChannel) => buildShareText({ channel });

  /**
   * The two self-directed links — "view your public signature page" and the
   * "View My Signature" CTA — are clicked by the SIGNER, never by a third
   * party. They carry the channel but deliberately NO `ref`.
   *
   * `ref=<the signer's own id>` here would be an own-goal against the very
   * loop this email exists to drive: the click stamps a first-touch referral
   * cookie that lives for 30 days (`referralCookiesToSet`), so a self-ref
   * would sit in the slot a genuine later referral needed. The database
   * rejects self-referral, so the harm isn't bad data — it's a swallowed
   * referral. The share buttons below keep their `ref`; those really do go to
   * someone else.
   */
  const ownPageUrl = withShareParams(opts.signerPageUrl, {
    ref: null,
    channel: "confirmation-email",
  });
  const { twitterHref, linkedinHref, emailHref: emailShareHref } = shareHrefs({
    url: shareUrlFor,
    text: shareTextFor,
  });

  const subject = `You signed the AI Bill of Rights v${opts.version}`;

  // LinkedIn's share dialog carries no text, so this is the block people
  // actually paste. It gets their sentence too.
  const suggestedMessage = `${shareTextFor("linkedin")} ${shareUrlFor("linkedin")}`;

  const text = `Hi ${opts.displayName},

You're Signer #${sigNum.toLocaleString()} of the AI Bill of Rights (v${opts.version}). Thank you for helping ensure a future with AI that supports human flourishing.

We're at ${total.toLocaleString()} signatures — help us reach ${milestone.toLocaleString()}!

Bring two friends — share your signature:

  Suggested message for LinkedIn (copy & paste):
  "${suggestedMessage}"

  Share on X: ${twitterHref}
  Share on LinkedIn: ${linkedinHref}
  Share via Email: ${emailShareHref}

View your public signature page: ${ownPageUrl}

Your data, your choice — you can revoke any time:
${opts.revokeUrl}

— The AI Bill of Rights project
`;

  const esc = escapeHtml;
  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f9fafb;font-family:system-ui,-apple-system,sans-serif;">
<div style="max-width:560px;margin:32px auto;background:#fff;border-radius:8px;border:1px solid #e5e7eb;overflow:hidden;">

  <!-- Green congrats banner -->
  <div style="background:#059669;padding:28px 28px 24px;text-align:center;">
    <div style="display:inline-block;width:48px;height:48px;line-height:48px;border-radius:50%;background:rgba(255,255,255,0.2);font-size:24px;color:#fff;">&#10003;</div>
    <h1 style="margin:12px 0 0;font-size:22px;font-weight:700;color:#fff;">Thank you for signing, ${esc(firstName)}!</h1>
    <p style="margin:6px 0 0;font-size:14px;color:rgba(255,255,255,0.85);">AI Bill of Rights v${esc(opts.version)}</p>
  </div>

  <!-- Signer number + milestone -->
  <div style="padding:24px 28px;text-align:center;border-bottom:1px solid #e5e7eb;">
    <p style="margin:0 0 2px;font-size:13px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">You are</p>
    <p style="margin:0;font-size:36px;font-weight:800;color:#111827;">Signer #${sigNum.toLocaleString()}</p>
    <p style="margin:8px 0 0;font-size:14px;color:#6b7280;">${total.toLocaleString()} signatures so far &mdash; help us reach <strong style="color:#111827;">${milestone.toLocaleString()}</strong>!</p>
  </div>

  <!-- Bring Two Friends -->
  <div style="padding:24px 28px;background:#fffbeb;border-bottom:1px solid #fde68a;">
    <h2 style="margin:0 0 4px;font-size:18px;font-weight:700;color:#92400e;">Bring Two Friends</h2>
    <p style="margin:0 0 16px;font-size:14px;color:#78350f;">Every signature strengthens the movement. Share yours now:</p>
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:12px 16px;margin:0 0 20px;">
      <p style="margin:0 0 6px;font-size:12px;font-weight:600;color:#0a66c2;text-transform:uppercase;letter-spacing:.04em;">Suggested message (copy &amp; paste for LinkedIn):</p>
      <p style="margin:0;font-size:14px;color:#111827;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;line-height:1.5;">${esc(suggestedMessage)}</p>
    </div>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
      <tr>
        <td style="padding:0 6px 0 0;">
          <a href="${esc(twitterHref)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:10px 20px;background:#111827;border-radius:6px;color:#fff;font-size:14px;font-weight:600;text-decoration:none;">Share on X</a>
        </td>
        <td style="padding:0 6px;">
          <a href="${esc(linkedinHref)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:10px 20px;background:#0a66c2;border-radius:6px;color:#fff;font-size:14px;font-weight:600;text-decoration:none;">LinkedIn</a>
        </td>
        <td style="padding:0 0 0 6px;">
          <a href="${esc(emailShareHref)}" style="display:inline-block;padding:10px 20px;background:#d1d5db;border-radius:6px;color:#111827;font-size:14px;font-weight:600;text-decoration:none;">Email</a>
        </td>
      </tr>
    </table>
  </div>

  <!-- View My Signature CTA -->
  <div style="padding:24px 28px;text-align:center;border-bottom:1px solid #e5e7eb;">
    <a href="${esc(ownPageUrl)}" style="display:inline-block;padding:12px 32px;background:#059669;border-radius:6px;color:#fff;font-size:15px;font-weight:600;text-decoration:none;">View My Signature</a>
  </div>

  <!-- Footer -->
  <div style="padding:16px 28px;">
    <p style="margin:0;font-size:13px;color:#9ca3af;">Your data, your choice &mdash; <a href="${esc(opts.revokeUrl)}" style="color:#6b7280;text-decoration:underline;">revoke any time</a>.</p>
    <p style="margin:8px 0 0;font-size:13px;color:#9ca3af;">&mdash; The AI Bill of Rights project</p>
  </div>

</div>
</body>
</html>`;

  return { subject, text, html };
}

export function signerNotification(opts: {
  displayName: string;
  signerPageUrl: string;
}): { subject: string; text: string } {
  return {
    subject: `${opts.displayName} just signed the AI Bill of Rights`,
    text: `Horray! ${opts.displayName} just signed the AI Bill of Rights!

Here's their unique signatory URL: ${opts.signerPageUrl}
(You can share this URL publicly with others)

- Your AI for People tech team, aka DROdio :)
`,
  };
}

export function signInvitation(opts: {
  inviterName: string;
  inviterPageUrl: string;
  siteUrl: string;
}): { subject: string; text: string } {
  return {
    subject: `${opts.inviterName} invited you to sign the AI Bill of Rights`,
    text: `${opts.inviterName} just signed the AI Bill of Rights — nine commitments we're demanding from every AI company — and thought you'd want to add your name too.

Read it and decide for yourself: ${opts.siteUrl}

${opts.inviterName}'s signature: ${opts.inviterPageUrl}

— The AI Bill of Rights project
`,
  };
}

export function selfieSubmittedAdminNotification(opts: {
  displayName: string;
  reviewUrl: string;
}): { subject: string; text: string } {
  return {
    subject: `${opts.displayName} submitted a selfie for you to approve`,
    text: `${opts.displayName} wants to add selfie to their profile.

You'll need to approve it before it goes live.

${opts.reviewUrl}

- Your tech specialist, aka DROdio :)
`,
  };
}

export function selfieApproved(opts: {
  displayName: string;
  signerPageUrl: string;
  accountUrl: string;
}): { subject: string; text: string } {
  return {
    subject: "Your photo is live on the AI Bill of Rights",
    text: `Hi ${opts.displayName},

Your photo has been approved and is now showing on your public signer page.

See it: ${opts.signerPageUrl}

Manage your photo (replace or remove) anytime:
${opts.accountUrl}

— The AI Bill of Rights project
`,
  };
}

export function selfieRejected(opts: {
  displayName: string;
  reasonText: string;
  accountUrl: string;
}): { subject: string; text: string } {
  return {
    subject: "We couldn't publish your photo",
    text: `Hi ${opts.displayName},

We weren't able to publish the photo you submitted: ${opts.reasonText}

You can try again with a different photo from your account page:
${opts.accountUrl}

— The AI Bill of Rights project
`,
  };
}

export function selfieAutoHidden(opts: {
  displayName: string;
  appealUrl: string;
}): { subject: string; text: string } {
  return {
    subject: "Your photo was temporarily hidden after multiple reports",
    text: `Hi ${opts.displayName},

Other signers reported your photo. As a safety measure we've hidden it from public view while an admin takes another look. If you think this was a mistake, you can upload a different photo from your account page:

${opts.appealUrl}

— The AI Bill of Rights project
`,
  };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"})[c] ?? c);
}

export function mentionEmail(opts: {
  mentionedDisplayName: string;
  mentioningDisplayName: string;
  body: string;
  commentUrl: string;
  selectedText: string | null;
}): { subject: string; text: string; html: string } {
  const subject = `${opts.mentioningDisplayName} mentioned you on the AI Bill of Rights`;
  const quoteLine = opts.selectedText
    ? `\n  Re: "${opts.selectedText}"\n`
    : "";
  const text = `Hi ${opts.mentionedDisplayName},

${opts.mentioningDisplayName} mentioned you in a comment on the AI Bill of Rights:
${quoteLine}
  ${opts.body}

View and reply: ${opts.commentUrl}

— The AI Bill of Rights project
`;
  const safeBody = escapeHtml(opts.body);
  const safeSelectedText = opts.selectedText ? escapeHtml(opts.selectedText) : null;
  const safeMentionedName = escapeHtml(opts.mentionedDisplayName);
  const safeMentioningName = escapeHtml(opts.mentioningDisplayName);
  const html = `<p>Hi ${safeMentionedName},</p>
<p><strong>${safeMentioningName}</strong> mentioned you in a comment on the AI Bill of Rights:</p>
${safeSelectedText ? `<blockquote style="border-left: 3px solid #06b6d4; padding-left: 1em; color: #555;">${safeSelectedText}</blockquote>` : ""}
<p>${safeBody.replace(/\n/g, "<br>")}</p>
<p><a href="${opts.commentUrl}">View and reply →</a></p>
<p style="color: #888; font-size: 0.875em;">— The AI Bill of Rights project</p>`;
  return { subject, text, html };
}

export function attestationVerifyEmail(opts: {
  orgName: string;
  productName: string;
  version: string;
  verifyUrl: string;
  submitterEmail: string;
  productUrl?: string | null;
  adminDashboardUrl?: string;
}): { subject: string; text: string; html: string } {
  const subject = `Admin review needed: ${opts.orgName} attestation for AI Bill of Rights v${opts.version}`;

  const dashboardLine = opts.adminDashboardUrl
    ? `  Admin dashboard (review before approving):\n  ${opts.adminDashboardUrl}\n`
    : "";
  const productLine = opts.productUrl
    ? `  Their product page:\n  ${opts.productUrl}\n`
    : "";

  const text = `An attestation has been submitted and needs your review before it goes live.

  Product:      ${opts.productName}
  Organization: ${opts.orgName}
  Version:      v${opts.version}
  Submitter:    ${opts.submitterEmail}

─────────────────────────────────────────────
STEP 1 — INVESTIGATE FIRST
─────────────────────────────────────────────

Do NOT approve yet. Look it up first.

${dashboardLine}${productLine}
─────────────────────────────────────────────
STEP 2 — APPROVE ONLY WHEN READY
─────────────────────────────────────────────

⚠  Only click the link below once you have confirmed this is a real
   company and product and you are ready to publish it publicly.
   The first admin to click IMMEDIATELY publishes the attestation.

  → APPROVE & PUBLISH NOW:
  ${opts.verifyUrl}

─────────────────────────────────────────────

Not sure? Skip this email. Unpublished attestations stay in the
queue — you can approve or hide them any time from the admin dashboard.

— The AI Bill of Rights project
`;

  const esc = escapeHtml;
  const productRowHtml = opts.productUrl
    ? `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;font-size:14px;">Product URL</td><td style="padding:4px 0;font-size:14px;"><a href="${esc(opts.productUrl)}" style="color:#0369a1;">${esc(opts.productUrl)}</a></td></tr>`
    : "";
  const dashboardBtnHtml = opts.adminDashboardUrl
    ? `<a href="${esc(opts.adminDashboardUrl)}" style="display:inline-block;padding:10px 20px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:6px;color:#111827;font-size:14px;font-weight:500;text-decoration:none;">View in Admin Dashboard</a>`
    : "";
  const productBtnHtml = opts.productUrl
    ? `<a href="${esc(opts.productUrl)}" style="display:inline-block;padding:10px 20px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:6px;color:#111827;font-size:14px;font-weight:500;text-decoration:none;">Visit Product Page</a>`
    : "";

  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f9fafb;font-family:system-ui,sans-serif;">
<div style="max-width:560px;margin:32px auto;background:#fff;border-radius:8px;border:1px solid #e5e7eb;overflow:hidden;">

  <div style="padding:24px 28px;border-bottom:1px solid #e5e7eb;">
    <p style="margin:0 0 4px;font-size:13px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">AI Bill of Rights · Admin</p>
    <h1 style="margin:0;font-size:20px;font-weight:600;color:#111827;">New attestation to review</h1>
  </div>

  <div style="padding:24px 28px;border-bottom:1px solid #e5e7eb;">
    <table style="border-collapse:collapse;">
      <tr><td style="padding:4px 12px 4px 0;color:#6b7280;font-size:14px;">Product</td><td style="padding:4px 0;font-size:14px;font-weight:500;">${esc(opts.productName)}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#6b7280;font-size:14px;">Organization</td><td style="padding:4px 0;font-size:14px;font-weight:500;">${esc(opts.orgName)}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#6b7280;font-size:14px;">Version</td><td style="padding:4px 0;font-size:14px;">v${esc(opts.version)}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#6b7280;font-size:14px;">Submitter</td><td style="padding:4px 0;font-size:14px;">${esc(opts.submitterEmail)}</td></tr>
      ${productRowHtml}
    </table>
  </div>

  <div style="padding:24px 28px;border-bottom:1px solid #e5e7eb;">
    <p style="margin:0 0 6px;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">Step 1 — Investigate first</p>
    <p style="margin:0 0 16px;font-size:14px;color:#374151;">Look it up before approving. Does this company and product actually exist?</p>
    <div style="display:flex;gap:10px;flex-wrap:wrap;">
      ${dashboardBtnHtml}
      ${productBtnHtml}
    </div>
  </div>

  <div style="padding:24px 28px;background:#fefce8;border-bottom:1px solid #fde68a;">
    <p style="margin:0 0 6px;font-size:12px;font-weight:600;color:#92400e;text-transform:uppercase;letter-spacing:.05em;">Step 2 — Approve only when ready</p>
    <p style="margin:0 0 4px;font-size:14px;color:#78350f;font-weight:500;">⚠ Only click the button below once you have confirmed this is a real company and product.</p>
    <p style="margin:0 0 20px;font-size:13px;color:#92400e;">The first admin to click will <strong>immediately publish</strong> the attestation publicly. This cannot be undone without going to the admin dashboard.</p>
    <a href="${esc(opts.verifyUrl)}" style="display:inline-block;padding:12px 28px;background:#15803d;border-radius:6px;color:#fff;font-size:15px;font-weight:600;text-decoration:none;">Approve &amp; Publish Attestation</a>
  </div>

  <div style="padding:16px 28px;">
    <p style="margin:0;font-size:13px;color:#9ca3af;">Not sure? Skip this email — the attestation stays in the queue. You can approve or hide it any time from the admin dashboard.</p>
  </div>

</div>
</body>
</html>`;

  return { subject, text, html };
}
