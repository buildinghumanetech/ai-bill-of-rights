import type { Principle } from "./principles";

/**
 * The verdict vocabulary. `not-assessed` is the default for every commitment
 * and is deliberately NOT a judgement: it means nobody has looked yet, and the
 * UI must never render it as though a conclusion had been reached.
 */
export const ASSESSED_STATUSES = [
  "meets",
  "partial",
  "falls-short",
  "unclear",
] as const;

export type AssessedStatus = (typeof ASSESSED_STATUSES)[number];

export const NOT_ASSESSED = "not-assessed" as const;

export type ScorecardStatus = AssessedStatus | typeof NOT_ASSESSED;

export const ALL_STATUSES: readonly ScorecardStatus[] = [
  ...ASSESSED_STATUSES,
  NOT_ASSESSED,
];

export function isAssessedStatus(v: unknown): v is AssessedStatus {
  return (
    typeof v === "string" &&
    (ASSESSED_STATUSES as readonly string[]).includes(v)
  );
}

export function isScorecardStatus(v: unknown): v is ScorecardStatus {
  return (
    typeof v === "string" && (ALL_STATUSES as readonly string[]).includes(v)
  );
}

export const STATUS_LABELS: Record<ScorecardStatus, string> = {
  meets: "Meets the commitment",
  partial: "Partially meets",
  "falls-short": "Falls short",
  unclear: "No clear public evidence",
  [NOT_ASSESSED]: "Not yet assessed",
};

/** Compact label for the grid on the index page. */
export const STATUS_SHORT_LABELS: Record<ScorecardStatus, string> = {
  meets: "Meets",
  partial: "Partial",
  "falls-short": "Falls short",
  unclear: "Unclear",
  [NOT_ASSESSED]: "Not assessed",
};

/**
 * A source the reader can go and check for themselves. Every assessed
 * commitment must carry at least one; see `parse.ts`.
 */
export interface Citation {
  url: string;
  /** Human-readable name of the source document. */
  title: string;
  /** ISO `YYYY-MM-DD` — the day a human opened this URL and read it. */
  checkedOn: string;
  /** Optional verbatim excerpt supporting the assessment. */
  quote?: string;
}

export interface AssessedEntry {
  principle: Principle;
  status: AssessedStatus;
  assessment: string;
  citations: Citation[];
}

export interface UnassessedEntry {
  principle: Principle;
  status: typeof NOT_ASSESSED;
  assessment: null;
  citations: [];
}

export type ScorecardAssessment = AssessedEntry | UnassessedEntry;

export function isAssessed(a: ScorecardAssessment): a is AssessedEntry {
  return a.status !== NOT_ASSESSED;
}

export interface ScorecardEntry {
  slug: string;
  company: string;
  /**
   * True when the entry is a format demonstration rather than a claim about a
   * real organisation. The UI must say so, loudly, wherever the entry appears.
   */
  fictional: boolean;
  oneLiner: string | null;
  homepageUrl: string | null;
  /** ISO `YYYY-MM-DD` — when this entry as a whole was last gone over. */
  lastReviewed: string;
  reviewedBy: string | null;
  /** Where a company or reader sends a correction. */
  disputeEmail: string | null;
  /** Free-form markdown body: scope notes for this particular entry. */
  notes: string;
  /** One row per commitment, in document order. Never sparse. */
  assessments: ScorecardAssessment[];
}

export function assessedCount(entry: ScorecardEntry): number {
  return entry.assessments.filter(isAssessed).length;
}
