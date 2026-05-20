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
}): { subject: string; text: string } {
  return {
    subject: `Admin review: ${opts.orgName}'s attestation for AI Bill of Rights v${opts.version}`,
    text: `An attestation has been submitted and is waiting for an admin to verify it:

  Product:      ${opts.productName}
  Organization: ${opts.orgName}
  Version:      v${opts.version}
  Submitter:    ${opts.submitterEmail}

You're receiving this because you're an admin on the AI Bill of Rights project. Any admin can publish this attestation by clicking the link below. The first click wins.

${opts.verifyUrl}

If this looks fake or low-quality, just ignore it — unpublished attestations stay in the queue and can be hidden from the admin dashboard.

— The AI Bill of Rights project
`,
  };
}
