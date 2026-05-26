import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { signers } from "@/lib/db/schema";
import {
  listAllAttestationsForAdmin,
  type AdminAttestationListItem,
} from "@/lib/db/queries";
import {
  approveAttestation,
  hideAttestation,
} from "@/server/actions/attestations";
import DeleteAttestationButton from "./DeleteAttestationButton";

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

const STATUS_CONFIG = {
  pending: {
    label: "Pending review",
    border: "border-amber-300 dark:border-amber-700",
    bg: "bg-amber-50 dark:bg-amber-950/30",
    badge: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  },
  approved: {
    label: "Approved",
    border: "border-emerald-300 dark:border-emerald-700",
    bg: "bg-emerald-50 dark:bg-emerald-950/30",
    badge: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  },
  hidden: {
    label: "Hidden",
    border: "border-zinc-300 dark:border-zinc-700",
    bg: "bg-zinc-50 dark:bg-zinc-900/30",
    badge: "bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300",
  },
} as const;

function AttestationRow({ item }: { item: AdminAttestationListItem }) {
  const cfg = STATUS_CONFIG[item.status];
  return (
    <div
      className={`rounded-lg border ${cfg.border} ${cfg.bg} p-4`}
    >
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-lg font-semibold">{item.orgName}</span>
        <span className="text-sm text-zinc-600 dark:text-zinc-400">
          · {item.productName}
        </span>
        <span
          className={`ml-auto inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${cfg.badge}`}
        >
          {cfg.label}
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
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {item.status === "pending" && (
          <>
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
          </>
        )}
        <DeleteAttestationButton
          attestationId={item.id}
          orgName={item.orgName}
        />
      </div>
    </div>
  );
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

  const allAttestations = await listAllAttestationsForAdmin();
  const pending = allAttestations.filter((a) => a.status === "pending");
  const approved = allAttestations.filter((a) => a.status === "approved");
  const hidden = allAttestations.filter((a) => a.status === "hidden");

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Admin · Attestations</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Manage all attestations. Approve pending claims, or delete any attestation permanently.
      </p>

      {allAttestations.length === 0 ? (
        <p className="mt-8 text-zinc-500">No attestations yet.</p>
      ) : (
        <>
          {/* Pending Review */}
          {pending.length > 0 && (
            <section className="mt-8">
              <h2 className="text-xl font-semibold tracking-tight">
                Pending Review ({pending.length})
              </h2>
              <div className="mt-4 flex flex-col gap-4">
                {pending.map((item) => (
                  <AttestationRow key={item.id} item={item} />
                ))}
              </div>
            </section>
          )}

          {/* Approved */}
          {approved.length > 0 && (
            <section className="mt-8">
              <h2 className="text-xl font-semibold tracking-tight">
                Approved ({approved.length})
              </h2>
              <div className="mt-4 flex flex-col gap-4">
                {approved.map((item) => (
                  <AttestationRow key={item.id} item={item} />
                ))}
              </div>
            </section>
          )}

          {/* Hidden */}
          {hidden.length > 0 && (
            <section className="mt-8">
              <h2 className="text-xl font-semibold tracking-tight">
                Hidden ({hidden.length})
              </h2>
              <div className="mt-4 flex flex-col gap-4">
                {hidden.map((item) => (
                  <AttestationRow key={item.id} item={item} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}
