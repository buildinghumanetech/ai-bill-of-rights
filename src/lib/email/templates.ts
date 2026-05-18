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

export function attestationVerifyEmail(opts: {
  orgName: string;
  productName: string;
  version: string;
  verifyUrl: string;
}): { subject: string; text: string } {
  return {
    subject: `Confirm: ${opts.orgName}'s attestation for AI Bill of Rights v${opts.version}`,
    text: `Someone — hopefully you — submitted an attestation that ${opts.productName} (${opts.orgName}) was built referencing AI Bill of Rights v${opts.version}.

To confirm, click this link:
${opts.verifyUrl}

If you didn't submit this, just ignore the email and the attestation will not be published.

— The AI Bill of Rights project
`,
  };
}
