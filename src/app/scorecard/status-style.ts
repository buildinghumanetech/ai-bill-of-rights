import { NOT_ASSESSED, type ScorecardStatus } from "@/lib/scorecard";

/**
 * `not-assessed` is styled to read as an empty slot, not a grade: no colour,
 * dashed border, muted text. Nothing about it should scan as a verdict.
 */
export const STATUS_CLASSES: Record<ScorecardStatus, string> = {
  meets: "border-emerald-300 bg-emerald-50 text-emerald-900",
  partial: "border-amber-300 bg-amber-50 text-amber-900",
  "falls-short": "border-rose-300 bg-rose-50 text-rose-900",
  unclear: "border-sky-300 bg-sky-50 text-sky-900",
  [NOT_ASSESSED]: "border-dashed border-zinc-300 bg-zinc-50 text-zinc-500",
};

export const STATUS_DOT_CLASSES: Record<ScorecardStatus, string> = {
  meets: "bg-emerald-600",
  partial: "bg-amber-500",
  "falls-short": "bg-rose-600",
  unclear: "bg-sky-500",
  [NOT_ASSESSED]: "bg-transparent ring-1 ring-inset ring-zinc-300",
};

export const STATUS_DESCRIPTIONS: Record<ScorecardStatus, string> = {
  meets:
    "The cited sources show the company doing what this commitment asks, for the scope described.",
  partial:
    "The cited sources show part of the commitment met and part not met.",
  "falls-short":
    "The cited sources show conduct that conflicts with this commitment.",
  unclear:
    "We looked and could not find a public source that settles it either way. This describes the public record, not the company.",
  [NOT_ASSESSED]:
    "Nobody has assessed this commitment for this company yet. No claim is being made.",
};
