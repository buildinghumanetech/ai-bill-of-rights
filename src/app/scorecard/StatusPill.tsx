import {
  STATUS_LABELS,
  STATUS_SHORT_LABELS,
  type ScorecardStatus,
} from "@/lib/scorecard";
import { STATUS_CLASSES, STATUS_DOT_CLASSES } from "./status-style";

export function StatusPill({
  status,
  short = false,
}: {
  status: ScorecardStatus;
  short?: boolean;
}) {
  return (
    <span
      data-status={status}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_CLASSES[status]}`}
    >
      <span
        aria-hidden
        className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT_CLASSES[status]}`}
      />
      {short ? STATUS_SHORT_LABELS[status] : STATUS_LABELS[status]}
    </span>
  );
}
