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

export function signConfirmation(opts: {
  displayName: string;
  version: string;
  signerPageUrl: string;
  revokeUrl: string;
}): { subject: string; text: string } {
  return {
    subject: `You signed the AI Bill of Rights v${opts.version}`,
    text: `Hi ${opts.displayName},

You just signed v${opts.version} of the AI Bill of Rights. Thank you for helping ensure a future with AI that supports human flourishing.

Share your public signature page so others can join you: ${opts.signerPageUrl}

Your data, your choice — you can revoke any time:
${opts.revokeUrl}

— The AI Bill of Rights project
`,
  };
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
