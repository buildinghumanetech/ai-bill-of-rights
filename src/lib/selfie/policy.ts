// Selfie input validation + policy constants. Pure functions — safe to import
// from server actions, tests, and client code alike.

export const MAX_INPUT_BYTES = 10 * 1024 * 1024;
export const ALLOWED_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
] as const;
export const MAX_INPUT_DIMENSION = 8000;
export const SELFIE_RATE_LIMIT_PER_HOUR = 5;
export const SELFIE_AUTO_HIDE_THRESHOLD = 3;

export type ValidationReason =
  | "empty"
  | "too_large"
  | "disallowed_mime"
  | "too_pixels";

export type ValidationResult =
  | { ok: true }
  | { ok: false; reason: ValidationReason };

export function validateSelfieInput(opts: {
  mime: string;
  declaredSize: number;
}): ValidationResult {
  if (opts.declaredSize <= 0) return { ok: false, reason: "empty" };
  if (opts.declaredSize > MAX_INPUT_BYTES)
    return { ok: false, reason: "too_large" };
  const normalized = opts.mime.toLowerCase();
  if (!(ALLOWED_MIMES as readonly string[]).includes(normalized))
    return { ok: false, reason: "disallowed_mime" };
  return { ok: true };
}

export function validateImageDimensions(
  width: number,
  height: number,
): ValidationResult {
  if (width > MAX_INPUT_DIMENSION || height > MAX_INPUT_DIMENSION)
    return { ok: false, reason: "too_pixels" };
  return { ok: true };
}

export const REJECTION_REASONS = [
  "not_a_face",
  "offensive",
  "imposter",
  "pii_overlay",
  "other",
] as const;
export type RejectionReason = (typeof REJECTION_REASONS)[number];

export function rejectionReasonToText(reason: RejectionReason): string {
  switch (reason) {
    case "not_a_face":
      return "We couldn't see a recognizable face in your photo.";
    case "offensive":
      return "Your photo includes content we can't publish on this site.";
    case "imposter":
      return "Your photo appears to show someone other than you.";
    case "pii_overlay":
      return "Your photo contains personal information that shouldn't be public (phone, address, etc.).";
    case "other":
      return "We weren't able to publish your photo.";
  }
}
