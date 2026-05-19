import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { signatures, signers, versions } from "@/lib/db/schema";
import { getCurrentAdmin } from "@/lib/admin/check";
import { bootstrapAdminAction } from "@/server/actions/admin";
import AdminRowActions from "./AdminRowActions";
import AdminAddSignerForm from "./AdminAddSignerForm";

export const dynamic = "force-dynamic";

export default async function AdminSignersPage() {
  const ctx = await getCurrentAdmin();

  if (
    ctx.state === "unauthenticated" ||
    ctx.state === "not-a-signer" ||
    ctx.state === "not-admin"
  ) {
    notFound();
  }

  if (ctx.state === "no-admins-yet") {
    return (
      <main className="mx-auto max-w-2xl px-6 py-24 text-center">
        <p className="text-xs font-medium uppercase tracking-[0.25em] text-zinc-500">
          Admin bootstrap
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950">
          No admins exist yet.
        </h1>
        <p className="mt-4 text-base leading-relaxed text-zinc-700">
          You&apos;re signed in as{" "}
          <span className="font-semibold">{ctx.signer.displayName}</span> but
          there&apos;s no admin in the system. The first signer to claim it
          becomes admin. Subsequent admins can only be granted by an existing
          admin.
        </p>
        <form action={bootstrapAdminAction} className="mt-8">
          <button
            type="submit"
            className="rounded-full bg-zinc-900 px-8 py-3 text-sm font-semibold text-white hover:bg-zinc-700"
          >
            Make me the first admin
          </button>
        </form>
      </main>
    );
  }

  // ctx.state === "admin": load the full signer list with admin-only fields.
  const rows = await db
    .select({
      id: signers.id,
      clerkUserId: signers.clerkUserId,
      displayName: signers.displayName,
      affiliation: signers.affiliation,
      locationText: signers.locationText,
      verificationMethod: signers.verificationMethod,
      isAdmin: signers.isAdmin,
      createdAt: signers.createdAt,
    })
    .from(signers)
    .orderBy(desc(signers.createdAt));

  // Latest signed version per signer (single query, deduped client-side
  // by ordering signatures by signed_at desc).
  const sigRows = await db
    .select({
      signerId: signatures.signerId,
      version: versions.version,
    })
    .from(signatures)
    .innerJoin(versions, eq(versions.id, signatures.versionId))
    .orderBy(desc(signatures.signedAt));
  const latestVersionBySigner = new Map<string, string>();
  for (const s of sigRows) {
    if (!latestVersionBySigner.has(s.signerId)) {
      latestVersionBySigner.set(s.signerId, s.version);
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-12">
      <header className="mb-8 flex items-end justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.25em] text-zinc-500">
            Admin
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">
            Signers ({rows.length})
          </h1>
          <p className="mt-2 text-sm text-zinc-600">
            Signed in as{" "}
            <span className="font-semibold">{ctx.signer.displayName}</span>.
            You can delete signers or grant admin to others.
          </p>
        </div>
        <Link
          href="/signers"
          className="text-sm text-zinc-600 underline-offset-4 hover:text-zinc-900 hover:underline"
        >
          View public list →
        </Link>
      </header>

      <div className="mb-8">
        <AdminAddSignerForm />
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-12 text-center text-zinc-600">
          No signers in the database.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-zinc-200 text-sm">
            <thead className="bg-zinc-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-600">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-600">
                  Location
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-600">
                  Method
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-600">
                  Role
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-600">
                  Version
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-600">
                  Joined
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-zinc-600">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-zinc-950">
                      {row.displayName}
                    </div>
                    {row.affiliation ? (
                      <div className="mt-0.5 text-xs text-zinc-500">
                        {row.affiliation}
                      </div>
                    ) : null}
                    <div className="mt-0.5 font-mono text-[10px] text-zinc-400">
                      {row.clerkUserId}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-zinc-700">
                    {row.locationText || (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-700">
                    {row.verificationMethod === "email" ? "Email" : "Phone"}
                  </td>
                  <td className="px-4 py-3">
                    {row.isAdmin ? (
                      <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">
                        Admin
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
                        Signer
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {latestVersionBySigner.get(row.id) ? (
                      <Link
                        href={`/v/${latestVersionBySigner.get(row.id)}`}
                        className="font-mono text-zinc-700 underline-offset-4 hover:text-blue-600 hover:underline"
                      >
                        v{latestVersionBySigner.get(row.id)}
                      </Link>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-500">
                    {row.createdAt instanceof Date
                      ? row.createdAt.toISOString().slice(0, 10)
                      : String(row.createdAt).slice(0, 10)}
                  </td>
                  <td className="px-4 py-3">
                    <AdminRowActions
                      signerId={row.id}
                      displayName={row.displayName}
                      isAdmin={row.isAdmin}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
