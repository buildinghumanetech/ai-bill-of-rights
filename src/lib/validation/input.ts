// Shared "looks like an email" check used by the anonymous public forms
// (attestation submit, contact) so the pattern doesn't drift between them.
// Pragmatic, not RFC-exhaustive: non-empty local part, "@", non-empty domain
// with a dot.
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
