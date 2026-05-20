import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentAdmin } from "@/lib/admin/check";
import { getCurrentVersion, listPendingProposalsForVersion } from "@/lib/db/queries";
import { acceptProposalAction, rejectProposalAction } from "@/server/actions/proposals";

export const dynamic = "force-dynamic";

async function handleAccept(formData: FormData) {
  "use server";
  await acceptProposalAction(String(formData.get("proposalId")));
}

async function handleReject(formData: FormData) {
  "use server";
  await rejectProposalAction(String(formData.get("proposalId")));
}

const KIND_LABEL: Record<string, string> = {
  replace: "Replace",
  insert_after: "Insert after",
  delete: "Delete",
};

export default async function AdminProposalsPage() {
  const ctx = await getCurrentAdmin();
  if (ctx.state !== "admin") notFound();

  const current = await getCurrentVersion().catch(() => null);
  const proposals = current
    ? await listPendingProposalsForVersion(db as any, current.id)
    : [];

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="text-2xl font-semibold">Admin · Pending Proposals</h1>
      <p className="mt-1 text-sm text-zinc-500">
        {proposals.length === 0
          ? "No pending proposals."
          : `${proposals.length} pending proposal${proposals.length !== 1 ? "s" : ""} on v${current?.version ?? "?"}.`}
      </p>

      <ul className="mt-6 space-y-4">
        {proposals.map((p) => (
          <li key={p.id} className="rounded-md border border-zinc-200 bg-white p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700">
                    {KIND_LABEL[p.kind] ?? p.kind}
                  </span>
                  <span className="font-mono text-xs text-zinc-500">
                    {p.targetAnchorId}
                  </span>
                  <span className="text-xs text-zinc-400 ml-auto">
                    {p.displayName} ·{" "}
                    {new Date(p.createdAt)
                      .toISOString()
                      .slice(0, 16)
                      .replace("T", " ")}
                  </span>
                </div>

                {p.newText && (
                  <div
                    className={`rounded px-3 py-2 text-sm mb-2 ${
                      p.kind === "replace"
                        ? "bg-emerald-50 border border-emerald-100 text-emerald-900"
                        : "bg-blue-50 border border-blue-100 text-blue-900"
                    }`}
                  >
                    {p.newText}
                  </div>
                )}
                {p.kind === "delete" && !p.newText && (
                  <div className="rounded bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-800 mb-2">
                    Proposed for removal.
                  </div>
                )}

                {p.rationale && (
                  <p className="text-sm text-zinc-600 italic border-l-2 border-zinc-200 pl-2">
                    {p.rationale}
                  </p>
                )}

                {p.upvoteCount > 0 && (
                  <p className="mt-1 text-xs text-zinc-500">
                    👍 {p.upvoteCount} upvote{p.upvoteCount !== 1 ? "s" : ""}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-2 shrink-0">
                <form action={handleAccept}>
                  <input type="hidden" name="proposalId" value={p.id} />
                  <button
                    type="submit"
                    className="w-full rounded px-3 py-1.5 text-xs font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
                  >
                    Accept
                  </button>
                </form>
                <form action={handleReject}>
                  <input type="hidden" name="proposalId" value={p.id} />
                  <button
                    type="submit"
                    className="w-full rounded px-3 py-1.5 text-xs font-medium bg-red-50 text-red-700 hover:bg-red-100 border border-red-200"
                  >
                    Reject
                  </button>
                </form>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
