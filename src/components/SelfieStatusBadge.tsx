import {
  rejectionReasonToText,
  type RejectionReason,
} from "@/lib/selfie/policy";

interface Props {
  status: "pending" | "approved" | "rejected" | "auto_hidden";
  rejectionReason?: RejectionReason | null;
}

export function SelfieStatusBadge({ status, rejectionReason }: Props) {
  switch (status) {
    case "pending":
      return (
        <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-200">
          Pending admin review
        </span>
      );
    case "approved":
      return (
        <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 ring-1 ring-inset ring-emerald-200">
          Live on your profile
        </span>
      );
    case "rejected":
      return (
        <span
          className="inline-flex items-center rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-800 ring-1 ring-inset ring-red-200"
          title={
            rejectionReason ? rejectionReasonToText(rejectionReason) : undefined
          }
        >
          Couldn&apos;t publish
          {rejectionReason ? `: ${rejectionReasonToText(rejectionReason)}` : ""}
        </span>
      );
    case "auto_hidden":
      return (
        <span className="inline-flex items-center rounded-full bg-orange-50 px-2.5 py-1 text-xs font-medium text-orange-800 ring-1 ring-inset ring-orange-200">
          Temporarily hidden after reports
        </span>
      );
  }
}
