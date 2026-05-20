import { notFound } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { versions } from "@/lib/db/schema";
import { getCurrentAdmin } from "@/lib/admin/check";
import {
  getAcceptedProposalsForVersion,
  countEndorsersForVersion,
  listPendingProposalsForVersion,
} from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default async function AdminReleasePage() {
  const ctx = await getCurrentAdmin();
  if (ctx.state !== "admin") notFound();

  const rows = await db.select().from(versions).where(eq(versions.isCurrent, true)).limit(1);
  const current = rows[0];
  if (!current) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="text-2xl font-semibold">Release</h1>
        <p className="mt-4 text-zinc-600">No current version in the database.</p>
      </main>
    );
  }

  const accepted = await getAcceptedProposalsForVersion(undefined as any, current.id);
  const pending = await listPendingProposalsForVersion(undefined as any, current.id);
  const endorserCount = await countEndorsersForVersion(undefined as any, current.id);

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-semibold">Release a new version</h1>
      <p className="mt-2 text-sm text-zinc-600">
        Current: <span className="font-mono">v{current.version}</span>
      </p>
      <dl className="mt-6 grid grid-cols-3 gap-4 rounded-md border border-zinc-200 bg-white p-4 text-sm">
        <div>
          <dt className="text-xs uppercase tracking-wide text-zinc-500">Accepted edits</dt>
          <dd className="mt-1 text-2xl font-semibold text-zinc-900">{accepted.length}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-zinc-500">Pending edits</dt>
          <dd className="mt-1 text-2xl font-semibold text-zinc-900">{pending.length}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-zinc-500">Endorsers waiting</dt>
          <dd className="mt-1 text-2xl font-semibold text-zinc-900">{endorserCount}</dd>
        </div>
      </dl>
      <div className="mt-8 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-semibold">Automated release is not wired yet.</p>
        <p className="mt-2">
          The current homepage articles live in <code>src/app/HomepageArticles.tsx</code>{" "}
          as a source-code array, not as a markdown file. Shipping a new version
          requires editing that array (via PR) to reflect the accepted edits,
          then bumping the version in <code>content/bill-of-rights/versions.json</code>.
        </p>
        <p className="mt-2">
          Once you&apos;ve published the new version, mark each accepted proposal as
          <code> published</code> in the <code>proposed_edits</code> table and stamp{" "}
          <code>endorsements.converted_to_version_id</code> so endorsers get the
          conversion email.
        </p>
        <p className="mt-2">
          A future iteration will automate this — for now, manual.
        </p>
      </div>
      <button
        type="button"
        disabled
        className="mt-6 rounded-full bg-zinc-200 px-5 py-2 text-sm font-semibold text-zinc-500"
      >
        Release (coming soon)
      </button>
      <p className="mt-4 text-xs text-zinc-500">
        <Link href="/admin" className="underline">← Back to admin</Link>
      </p>
    </main>
  );
}
