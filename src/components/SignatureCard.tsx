import Link from "next/link";
import { VerificationBadge } from "./VerificationBadge";
import { SelfieAvatar } from "./SelfieAvatar";
import type { SignerListItem } from "@/lib/db/queries";

interface Props {
  item: SignerListItem;
  /** Optional pre-fetched batch of active selfies, keyed by signerId. */
  activeSelfies?: Map<
    string,
    { displayBlobUrl: string; thumbnailBlobUrl: string }
  >;
}

export function SignatureCard({ item, activeSelfies }: Props) {
  return (
    <Link
      href={`/signatories/${item.signerId}`}
      className="flex items-center gap-3 rounded-lg border border-zinc-200 p-4 transition-colors hover:bg-zinc-50"
    >
      <SelfieAvatar
        size="sm"
        signerId={item.signerId}
        displayName={item.displayName}
        preloadedActiveSelfies={activeSelfies}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-base font-semibold text-zinc-950">
            {item.displayName}
          </span>
          <VerificationBadge method={item.verificationMethod} />
        </div>
        <div className="mt-1 text-sm text-zinc-600">
          {[item.locationText, item.affiliation].filter(Boolean).join(" · ") ||
            "—"}
        </div>
        <div className="mt-2 text-xs text-zinc-500">
          Signed v{item.version} on {item.signedAt.toISOString().slice(0, 10)}
        </div>
      </div>
    </Link>
  );
}
