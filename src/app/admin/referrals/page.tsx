import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentAdmin } from "@/lib/admin/check";
import { getDb } from "@/lib/db/lazy";
import { getReferralTotals, listReferrers } from "@/lib/db/referrals";

export const dynamic = "force-dynamic";

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function AdminReferralsPage() {
  const ctx = await getCurrentAdmin();

  if (ctx.state !== "admin") {
    notFound();
  }

  const db = getDb();
  const [totals, referrers] = await Promise.all([
    getReferralTotals(db),
    listReferrers(db),
  ]);

  const share =
    totals.signersSinceTrackingStart > 0
      ? Math.round(
          (totals.referredSigners / totals.signersSinceTrackingStart) * 1000,
        ) / 10
      : null;

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-12">
      <nav className="mb-4 flex gap-4 text-sm">
        <Link
          href="/admin/signers"
          className="text-zinc-600 hover:text-zinc-900 hover:underline"
        >
          Signers
        </Link>
        <Link
          href="/admin/selfies"
          className="text-zinc-600 hover:text-zinc-900 hover:underline"
        >
          Selfies
        </Link>
        <Link
          href="/admin/attestations"
          className="text-zinc-600 hover:text-zinc-900 hover:underline"
        >
          Attestations
        </Link>
        <Link href="/admin/referrals" className="font-medium text-zinc-900">
          Referrals
        </Link>
      </nav>
      <header className="mb-8">
        <p className="text-xs font-medium uppercase tracking-[0.25em] text-zinc-500">
          Admin
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">
          Referrals
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          Referral tracking began Sept 24, 2026. Nothing before that is
          counted.
        </p>
      </header>

      <section className="mb-8 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <p className="text-3xl font-semibold tracking-tight text-zinc-950">
          {totals.referredSigners}
          {share !== null ? (
            <span className="ml-3 text-lg font-medium text-zinc-500">
              ({share}%)
            </span>
          ) : null}
        </p>
        <p className="mt-2 text-sm text-zinc-600">
          signers arrived through someone&apos;s share link, out of{" "}
          <span className="font-semibold">
            {totals.signersSinceTrackingStart}
          </span>{" "}
          people who have signed since Sept 24, 2026. Only people who
          actually signed are counted, not comment-only accounts.
        </p>
      </section>

      {referrers.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-12 text-center text-zinc-600">
          No one has brought in a signer yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-zinc-200 text-sm">
            <thead className="bg-zinc-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-600">
                  Signer
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-zinc-600">
                  Brought in
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {referrers.map((r) => (
                <tr key={r.signerId} className="align-top hover:bg-zinc-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/signatories/${r.signerId}`}
                      className="font-medium text-zinc-950 underline-offset-4 hover:text-blue-600 hover:underline"
                    >
                      {r.displayName}
                    </Link>
                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-900">
                        Show who
                      </summary>
                      <ul className="mt-2 space-y-1">
                        {r.referred.map((p) => (
                          <li
                            key={p.signerId}
                            className="flex gap-3 text-xs text-zinc-700"
                          >
                            <Link
                              href={`/signatories/${p.signerId}`}
                              className="underline-offset-4 hover:text-blue-600 hover:underline"
                            >
                              {p.displayName}
                            </Link>
                            <span className="text-zinc-400">
                              {formatDate(p.signedAt)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-zinc-900">
                    {r.count}
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
