export const FRONTIER_LAB_NAMES = [
  "openai",
  "anthropic",
  "google",
  "deepmind",
  "google deepmind",
  "meta",
  "amazon",
  "microsoft",
  "apple",
  "mistral",
  "xai",
  "x.ai",
  "cohere",
  "perplexity",
  "inflection",
  "stability",
  "stability ai",
];

/**
 * Returns true if the org name plausibly claims to be one of the frontier
 * AI labs. We err on the side of false-positives — manual review by an admin
 * is the safety valve.
 */
export function needsManualReview(orgName: string): boolean {
  const lower = orgName.toLowerCase();
  return FRONTIER_LAB_NAMES.some((name) =>
    new RegExp(`\\b${name.replace(/\./g, "\\.")}\\b`, "i").test(lower),
  );
}
