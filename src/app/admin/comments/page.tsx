import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { comments, signers } from "@/lib/db/schema";
import { getCurrentAdmin } from "@/lib/admin/check";
import { hideCommentAction, unhideCommentAction } from "@/server/actions/comments";

export const dynamic = "force-dynamic";

async function handleHide(formData: FormData) {
  "use server";
  await hideCommentAction(String(formData.get("commentId")));
}
async function handleUnhide(formData: FormData) {
  "use server";
  await unhideCommentAction(String(formData.get("commentId")));
}

export default async function AdminCommentsPage() {
  const ctx = await getCurrentAdmin();
  if (ctx.state !== "admin") notFound();

  const rows = await db
    .select({
      id: comments.id,
      body: comments.body,
      anchorId: comments.anchorId,
      proposalId: comments.proposalId,
      displayName: signers.displayName,
      createdAt: comments.createdAt,
      hiddenAt: comments.hiddenAt,
    })
    .from(comments)
    .innerJoin(signers, eq(signers.id, comments.signerId))
    .orderBy(desc(comments.createdAt))
    .limit(100);

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="text-2xl font-semibold">Admin · Comments</h1>
      <ul className="mt-6 space-y-3">
        {rows.map((c) => (
          <li
            key={c.id}
            className={`rounded border p-3 text-sm ${c.hiddenAt ? "border-zinc-200 bg-zinc-50" : "border-zinc-200 bg-white"}`}
          >
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-zinc-500">
                {c.displayName} on {c.anchorId ?? `proposal ${c.proposalId}`}
              </span>
              <span className="text-xs text-zinc-400">
                {new Date(c.createdAt).toISOString().slice(0, 16).replace("T", " ")}
              </span>
            </div>
            <p className="mt-1 text-zinc-800">{c.body}</p>
            <form action={c.hiddenAt ? handleUnhide : handleHide} className="mt-2">
              <input type="hidden" name="commentId" value={c.id} />
              <button
                type="submit"
                className={`rounded px-3 py-1 text-xs ${c.hiddenAt ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}
              >
                {c.hiddenAt ? "Unhide" : "Hide"}
              </button>
            </form>
          </li>
        ))}
      </ul>
    </main>
  );
}
