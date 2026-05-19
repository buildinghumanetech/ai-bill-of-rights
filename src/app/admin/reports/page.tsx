import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { signers } from "@/lib/db/schema";
import { listPendingReports } from "@/lib/db/queries";
import { hideComment } from "@/server/actions/comments";
import { resolveReport } from "@/server/actions/reports";

export const dynamic = "force-dynamic";

async function adminCheck(): Promise<string | null> {
  const { userId } = await auth();
  if (!userId) return null;
  const rows = await db
    .select({ id: signers.id, isAdmin: signers.isAdmin })
    .from(signers)
    .where(eq(signers.clerkUserId, userId))
    .limit(1);
  if (!rows[0]?.isAdmin) return null;
  return rows[0].id;
}

async function hideAction(formData: FormData): Promise<void> {
  "use server";
  const adminId = await adminCheck();
  if (!adminId) throw new Error("Not authorized");
  const reportId = String(formData.get("reportId"));
  const commentId = String(formData.get("commentId"));
  await hideComment(null, commentId, "moderator: hidden");
  await resolveReport(null, reportId, adminId, "hidden");
  redirect("/admin/reports");
}

async function allowAction(formData: FormData): Promise<void> {
  "use server";
  const adminId = await adminCheck();
  if (!adminId) throw new Error("Not authorized");
  const reportId = String(formData.get("reportId"));
  await resolveReport(null, reportId, adminId, "allowed");
  redirect("/admin/reports");
}

export default async function AdminReportsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/");
  const rows = await db
    .select({ isAdmin: signers.isAdmin })
    .from(signers)
    .where(eq(signers.clerkUserId, userId))
    .limit(1);
  if (!rows[0]?.isAdmin) {
    return (
      <main className="mx-auto w-full max-w-2xl px-6 py-12">
        <h1 className="text-2xl font-semibold">Not authorized</h1>
      </main>
    );
  }
  const pending = await listPendingReports();
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Admin · Reports</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Reports pending moderator decision. Hide bad content or allow if the report was unfounded.
      </p>
      <div className="mt-8 flex flex-col gap-4">
        {pending.length === 0 ? (
          <p className="text-zinc-500">Nothing in the queue.</p>
        ) : (
          pending.map((p: any) => (
            <div key={p.reportId} className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
              <div className="text-xs uppercase tracking-widest text-zinc-500">
                v{p.commentVersion} · {p.commentAnchorId}
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm">{p.commentBody}</p>
              <div className="mt-3 text-xs text-zinc-500">
                Reported by {p.reporterName} · Reason: {p.reason || "(none given)"} · {new Date(p.createdAt).toISOString().slice(0, 16).replace("T", " ")}
              </div>
              <div className="mt-3 flex gap-2">
                <form action={hideAction}>
                  <input type="hidden" name="reportId" value={p.reportId} />
                  <input type="hidden" name="commentId" value={p.commentId} />
                  <button type="submit" className="rounded-full bg-red-700 px-4 py-1.5 text-xs font-medium text-white">
                    Hide comment
                  </button>
                </form>
                <form action={allowAction}>
                  <input type="hidden" name="reportId" value={p.reportId} />
                  <button type="submit" className="rounded-full border border-zinc-300 px-4 py-1.5 text-xs font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
                    Allow (false report)
                  </button>
                </form>
              </div>
            </div>
          ))
        )}
      </div>
    </main>
  );
}
