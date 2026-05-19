export function signConfirmation(opts: {
  displayName: string;
  version: string;
  signerPageUrl: string;
  revokeUrl: string;
}): { subject: string; text: string } {
  return {
    subject: `You signed the AI Bill of Rights v${opts.version}`,
    text: `Hi ${opts.displayName},

You just signed v${opts.version} of the AI Bill of Rights. Thank you.

Your public page: ${opts.signerPageUrl}

Your data, your choice — you can revoke any time:
${opts.revokeUrl}

— The AI Bill of Rights project
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
