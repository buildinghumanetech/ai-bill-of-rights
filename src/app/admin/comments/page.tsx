import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { eq, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { signers, comments, versions } from "@/lib/db/schema";
import { hideComment, unhideComment } from "@/server/actions/comments";

export const dynamic = "force-dynamic";

async function adminCheck(): Promise<boolean> {
  const { userId } = await auth();
  if (!userId) return false;
  const rows = await db.select({ isAdmin: signers.isAdmin }).from(signers).where(eq(signers.clerkUserId, userId)).limit(1);
  return Boolean(rows[0]?.isAdmin);
}

async function hideAction(formData: FormData): Promise<void> {
  "use server";
  if (!(await adminCheck())) throw new Error("Not authorized");
  await hideComment(null, String(formData.get("id")), "moderator: hidden");
  redirect("/admin/comments");
}

async function unhideAction(formData: FormData): Promise<void> {
  "use server";
  if (!(await adminCheck())) throw new Error("Not authorized");
  await unhideComment(null, String(formData.get("id")));
  redirect("/admin/comments");
}

export default async function AdminCommentsPage() {
  if (!(await adminCheck())) {
    return (
      <main className="mx-auto w-full max-w-2xl px-6 py-12">
        <h1 className="text-2xl font-semibold">Not authorized</h1>
      </main>
    );
  }
  const rows = await db
    .select({
      id: comments.id,
      body: comments.body,
      createdAt: comments.createdAt,
      hiddenAt: comments.hiddenAt,
      hiddenReason: comments.hiddenReason,
      anchorId: comments.anchorId,
      displayName: signers.displayName,
      version: versions.version,
    })
    .from(comments)
    .innerJoin(signers, eq(signers.id, comments.signerId))
    .innerJoin(versions, eq(versions.id, comments.versionId))
    .orderBy(desc(comments.createdAt))
    .limit(100);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Admin · Comments</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">100 most recent comments. Hide/unhide as needed.</p>
      <div className="mt-6 flex flex-col gap-3">
        {rows.map((c: any) => (
          <div key={c.id} className={`rounded-lg border p-3 ${c.hiddenAt ? "border-zinc-300 bg-zinc-50 opacity-60 dark:border-zinc-700 dark:bg-zinc-900" : "border-zinc-200 dark:border-zinc-800"}`}>
            <div className="text-xs text-zinc-500">
              {c.displayName} · v{c.version} · {c.anchorId} · {new Date(c.createdAt).toISOString().slice(0, 16).replace("T", " ")}
              {c.hiddenAt ? ` · hidden: ${c.hiddenReason ?? "—"}` : ""}
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm">{c.body}</p>
            <div className="mt-2">
              {c.hiddenAt ? (
                <form action={unhideAction}>
                  <input type="hidden" name="id" value={c.id} />
                  <button type="submit" className="rounded-full border border-zinc-300 px-3 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">Unhide</button>
                </form>
              ) : (
                <form action={hideAction}>
                  <input type="hidden" name="id" value={c.id} />
                  <button type="submit" className="rounded-full bg-red-700 px-3 py-1 text-xs font-medium text-white">Hide</button>
                </form>
              )}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
