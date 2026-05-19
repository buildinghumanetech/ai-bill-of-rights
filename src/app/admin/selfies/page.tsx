import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentAdmin } from "@/lib/admin/check";
import {
  getApprovedSelfiesForAdmin,
  getAutoHiddenSelfies,
  getPendingSelfies,
  getRejectedSelfies,
  type AdminSelfieRow,
} from "@/lib/selfie/queries";
import AdminSelfiesClient, { type AdminSelfieClientRow } from "./AdminSelfiesClient";

export const dynamic = "force-dynamic";

type Tab = "pending" | "auto_hidden" | "rejected" | "approved";

function asClientRow(r: AdminSelfieRow): AdminSelfieClientRow {
  return {
    id: r.id,
    signerId: r.signerId,
    displayBlobUrl: r.displayBlobUrl,
    submittedAt: r.submittedAt.toISOString(),
    reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
    captureMethod: r.captureMethod,
    rejectionReason: r.rejectionReason as AdminSelfieClientRow["rejectionReason"],
    autoHiddenAt: r.autoHiddenAt ? r.autoHiddenAt.toISOString() : null,
    signer: {
      displayName: r.signer.displayName,
      affiliation: r.signer.affiliation,
      locationText: r.signer.locationText,
      verificationMethod: r.signer.verificationMethod,
      memberSince: r.signer.memberSince.toISOString(),
    },
  };
}

export default async function AdminSelfiesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const ctx = await getCurrentAdmin();
  if (ctx.state !== "admin") notFound();

  const { tab: tabParam = "pending" } = await searchParams;
  const tab: Tab = (
    ["pending", "auto_hidden", "rejected", "approved"] as const
  ).includes(tabParam as Tab)
    ? (tabParam as Tab)
    : "pending";

  let rows: AdminSelfieRow[] = [];
  if (tab === "pending") rows = await getPendingSelfies();
  else if (tab === "auto_hidden") rows = await getAutoHiddenSelfies();
  else if (tab === "rejected") rows = await getRejectedSelfies();
  else rows = await getApprovedSelfiesForAdmin();

  const pendingCount = (await getPendingSelfies()).length;
  const autoHiddenCount = (await getAutoHiddenSelfies()).length;

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-12">
      <nav className="mb-4 flex gap-4 text-sm">
        <Link
          href="/admin/signers"
          className="text-zinc-600 hover:text-zinc-900 hover:underline"
        >
          Signers
        </Link>
        <Link href="/admin/selfies" className="font-medium text-zinc-900">
          Selfies
        </Link>
      </nav>
      <header className="mb-8 flex items-end justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.25em] text-zinc-500">
            Admin
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">
            Selfies
          </h1>
          <p className="mt-2 text-sm text-zinc-600">
            Approve, reject, restore, or unpublish signer photos. Submitted
            photos are not visible publicly until approved.
          </p>
        </div>
      </header>
      <AdminSelfiesClient
        rows={rows.map(asClientRow)}
        currentTab={tab}
        counts={{ pending: pendingCount, auto_hidden: autoHiddenCount }}
      />
    </main>
  );
}
