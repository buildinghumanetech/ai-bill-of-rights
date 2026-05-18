interface Props {
  method: "email" | "sms";
}
export function VerificationBadge({ method }: Props) {
  return (
    <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200">
      Verified via {method === "email" ? "email" : "SMS"}
    </span>
  );
}
