import type { AttestationListItem } from "@/lib/db/queries";

interface Props {
  item: AttestationListItem;
}

export function AttestationCard({ item }: Props) {
  return (
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
          {item.productName}
        </span>
        <span className="text-sm text-zinc-500">by {item.orgName}</span>
      </div>
      {item.productUrl ? (
        <div className="mt-1 text-sm">
          <a
            href={item.productUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-zinc-700 underline-offset-4 hover:underline dark:text-zinc-300"
          >
            {item.productUrl}
          </a>
        </div>
      ) : null}
      <div className="mt-2 text-xs text-zinc-500">
        Attested to v{item.version} on {item.claimedAt.toISOString().slice(0, 10)}
      </div>
    </div>
  );
}
