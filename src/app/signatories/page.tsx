import { listSignatures } from "@/lib/db/queries";
import { getActiveSelfiesForSigners } from "@/lib/selfie/queries";
import { SignatureCard } from "@/components/SignatureCard";

export const dynamic = "force-dynamic";

export default async function SignatoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page = "1" } = await searchParams;
  const pageNum = Math.max(1, Number(page) || 1);
  const limit = 50;
  const rows = await listSignatures(undefined, {
    limit,
    offset: (pageNum - 1) * limit,
  });
  const signerIds = rows.map((r) => r.signerId);
  const activeSelfies = await getActiveSelfiesForSigners(signerIds);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Signatories</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Everyone who has signed, newest first.
      </p>
      <div className="mt-8 flex flex-col gap-3">
        {rows.length === 0 ? (
          <p className="text-zinc-500">No signatures yet. Be the first.</p>
        ) : (
          rows.map((item) => (
            <SignatureCard
              key={item.signerId + item.version}
              item={item}
              activeSelfies={activeSelfies}
            />
          ))
        )}
      </div>
      {rows.length === limit ? (
        <div className="mt-8 flex justify-center">
          <a
            href={`/signatories?page=${pageNum + 1}`}
            className="rounded-full border border-zinc-300 px-6 py-2 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Next page →
          </a>
        </div>
      ) : null}
    </main>
  );
}
