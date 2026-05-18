import Link from "next/link";
import { VerificationBadge } from "./VerificationBadge";
import type { SignerListItem } from "@/lib/db/queries";

interface Props {
  item: SignerListItem;
}

export function SignatureCard({ item }: Props) {
  return (
    <Link
      href={`/signatories/${item.signerId}`}
      className="block rounded-lg border border-zinc-200 p-4 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
          {item.displayName}
        </span>
        <VerificationBadge method={item.verificationMethod} />
      </div>
      <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        {[item.locationText, item.affiliation].filter(Boolean).join(" · ") ||
          "—"}
      </div>
      <div className="mt-2 text-xs text-zinc-500">
        Signed v{item.version} on {item.signedAt.toISOString().slice(0, 10)}
      </div>
    </Link>
  );
}
