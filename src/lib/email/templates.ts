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

export function releaseConversionEmail(opts: {
  displayName: string;
  newVersion: string;
  signUrl: string;
}): { subject: string; text: string } {
  return {
    subject: `Your endorsed draft just shipped as v${opts.newVersion}`,
    text: `Hi ${opts.displayName},

A new version of the AI Bill of Rights just shipped: v${opts.newVersion}. You endorsed it while it was a working draft — thanks for shaping it.

Sign v${opts.newVersion} now to make it official: ${opts.signUrl}

— The AI Bill of Rights project
`,
  };
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
