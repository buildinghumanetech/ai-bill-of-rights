import { listPublishedAttestations } from "@/lib/db/queries";
import { AttestationCard } from "@/components/AttestationCard";

export const dynamic = "force-dynamic";

export default async function AttestationsPage({
  searchParams,
}: {
  searchParams: Promise<{ version?: string; page?: string }>;
}) {
  const { version, page = "1" } = await searchParams;
  const pageNum = Math.max(1, Number(page) || 1);
  const limit = 50;
  const rows = await listPublishedAttestations(undefined, {
    limit,
    offset: (pageNum - 1) * limit,
    versionString: version,
  });

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Attestations</h1>
      <p className="mt-2 text-sm text-zinc-600">
        AI products whose builders publicly committed to a version of the Bill
        of Rights{version ? ` (filtered: v${version})` : ""}.
      </p>
      <div className="mt-8 flex flex-col gap-3">
        {rows.length === 0 ? (
          <p className="text-zinc-500">No attestations yet.</p>
        ) : (
          rows.map((item) => <AttestationCard key={item.id} item={item} />)
        )}
      </div>
      {rows.length === limit ? (
        <div className="mt-8 flex justify-center">
          <a
            href={`/attestations?page=${pageNum + 1}${version ? `&version=${encodeURIComponent(version)}` : ""}`}
            className="rounded-full border border-zinc-300 px-6 py-2 text-sm font-medium hover:bg-zinc-100"
          >
            Next page →
          </a>
        </div>
      ) : null}
    </main>
  );
}
