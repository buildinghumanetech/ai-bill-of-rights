import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { signers } from "@/lib/db/schema";
import { listPendingReviewAttestations } from "@/lib/db/queries";
import {
  approveAttestation,
  hideAttestation,
} from "@/server/actions/attestations";

export const dynamic = "force-dynamic";

async function approveFormAction(formData: FormData): Promise<void> {
  "use server";
  const { userId } = await auth();
  if (!userId) redirect("/");
  const adminCheck = await db
    .select({ isAdmin: signers.isAdmin })
    .from(signers)
    .where(eq(signers.clerkUserId, userId))
    .limit(1);
  if (!adminCheck[0]?.isAdmin) {
    throw new Error("Not authorized");
  }
  const id = String(formData.get("id"));
  await approveAttestation(null, id);
  redirect("/admin/attestations");
}

async function hideFormAction(formData: FormData): Promise<void> {
  "use server";
  const { userId } = await auth();
  if (!userId) redirect("/");
  const adminCheck = await db
    .select({ isAdmin: signers.isAdmin })
    .from(signers)
    .where(eq(signers.clerkUserId, userId))
    .limit(1);
  if (!adminCheck[0]?.isAdmin) {
    throw new Error("Not authorized");
  }
  const id = String(formData.get("id"));
  const reason = String(formData.get("reason") ?? "false claim");
  await hideAttestation(null, id, reason);
  redirect("/admin/attestations");
}

export default async function AdminAttestationsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/");
  const adminCheck = await db
    .select({ isAdmin: signers.isAdmin })
    .from(signers)
    .where(eq(signers.clerkUserId, userId))
    .limit(1);
  if (!adminCheck[0]?.isAdmin) {
    return (
      <main className="mx-auto w-full max-w-2xl px-6 py-12">
        <h1 className="text-2xl font-semibold">Not authorized</h1>
        <p className="mt-3 text-sm text-zinc-600">
          This page is restricted to project administrators.
        </p>
      </main>
    );
  }

  const pending = await listPendingReviewAttestations();

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Admin · Attestation Review</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Email-verified attestations claiming a high-profile org name. Approve to publish, or hide if false.
      </p>
      <div className="mt-8 flex flex-col gap-4">
        {pending.length === 0 ? (
          <p className="text-zinc-500">Nothing in the review queue.</p>
        ) : (
          pending.map((item: any) => (
            <div
              key={item.id}
              className="rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950/30"
            >
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-lg font-semibold">{item.orgName}</span>
                <span className="text-sm text-zinc-600 dark:text-zinc-400">
                  · {item.productName}
                </span>
              </div>
              <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                Version: v{item.version} · Contact: {item.contactEmail}
              </div>
              {item.productUrl ? (
                <div className="mt-1 text-xs">
                  <a
                    href={item.productUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    {item.productUrl}
                  </a>
                </div>
              ) : null}
              <div className="mt-1 text-xs text-zinc-500">
                Claimed: {new Date(item.claimedAt).toISOString().slice(0, 10)}
                {item.emailVerifiedAt
                  ? ` · Email verified: ${new Date(item.emailVerifiedAt).toISOString().slice(0, 10)}`
                  : ""}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <form action={approveFormAction}>
                  <input type="hidden" name="id" value={item.id} />
                  <button
                    type="submit"
                    className="rounded-full bg-emerald-700 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-600"
                  >
                    Approve &amp; publish
                  </button>
                </form>
                <form action={hideFormAction}>
                  <input type="hidden" name="id" value={item.id} />
                  <input type="hidden" name="reason" value="false claim" />
                  <button
                    type="submit"
                    className="rounded-full bg-red-700 px-5 py-2 text-sm font-medium text-white hover:bg-red-600"
                  >
                    Hide (false claim)
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
