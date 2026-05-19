import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { eq, ilike, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { signers } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

async function adminCheck(): Promise<boolean> {
  const { userId } = await auth();
  if (!userId) return false;
  const rows = await db.select({ isAdmin: signers.isAdmin }).from(signers).where(eq(signers.clerkUserId, userId)).limit(1);
  return Boolean(rows[0]?.isAdmin);
}

async function toggleAdminAction(formData: FormData): Promise<void> {
  "use server";
  if (!(await adminCheck())) throw new Error("Not authorized");
  const id = String(formData.get("id"));
  const make = formData.get("make") === "yes";
  await db.update(signers).set({ isAdmin: make }).where(eq(signers.id, id));
  redirect("/admin/signers");
}

async function toggleBanAction(formData: FormData): Promise<void> {
  "use server";
  if (!(await adminCheck())) throw new Error("Not authorized");
  const id = String(formData.get("id"));
  const ban = formData.get("ban") === "yes";
  await db.update(signers).set({ softBannedAt: ban ? new Date() : null }).where(eq(signers.id, id));
  redirect("/admin/signers");
}

export default async function AdminSignersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  if (!(await adminCheck())) {
    return (
      <main className="mx-auto w-full max-w-2xl px-6 py-12">
        <h1 className="text-2xl font-semibold">Not authorized</h1>
      </main>
    );
  }
  const { q = "" } = await searchParams;
  const rows = q
    ? await db.select().from(signers).where(
        or(
          ilike(signers.displayName, `%${q}%`),
          ilike(signers.locationText, `%${q}%`),
          ilike(signers.affiliation, `%${q}%`),
        ),
      ).limit(50)
    : await db.select().from(signers).orderBy(signers.createdAt).limit(50);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Admin · Signers</h1>
      <form className="mt-4 flex gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search name / location / affiliation"
          className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        />
        <button type="submit" className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-50 dark:text-zinc-950">Search</button>
      </form>
      <div className="mt-6 flex flex-col gap-3">
        {rows.map((s: any) => (
          <div key={s.id} className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-medium">{s.displayName}</span>
              {s.isAdmin ? <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs text-violet-800 dark:bg-violet-900/30 dark:text-violet-200">admin</span> : null}
              {s.softBannedAt ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-800 dark:bg-red-900/30 dark:text-red-200">soft-banned</span> : null}
            </div>
            <div className="mt-1 text-xs text-zinc-500">
              {[s.locationText, s.affiliation].filter(Boolean).join(" · ") || "—"}
            </div>
            <div className="mt-3 flex gap-2">
              <form action={toggleAdminAction}>
                <input type="hidden" name="id" value={s.id} />
                <input type="hidden" name="make" value={s.isAdmin ? "no" : "yes"} />
                <button type="submit" className="rounded-full border border-zinc-300 px-3 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
                  {s.isAdmin ? "Revoke admin" : "Make admin"}
                </button>
              </form>
              <form action={toggleBanAction}>
                <input type="hidden" name="id" value={s.id} />
                <input type="hidden" name="ban" value={s.softBannedAt ? "no" : "yes"} />
                <button type="submit" className="rounded-full border border-red-300 px-3 py-1 text-xs text-red-700 hover:bg-red-50 dark:border-red-700 dark:hover:bg-red-900/30">
                  {s.softBannedAt ? "Unban" : "Soft-ban"}
                </button>
              </form>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
