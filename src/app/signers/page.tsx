import Link from "next/link";
import { listSignatures, type SignerListItem } from "@/lib/db/queries";
import { getActiveSelfiesForSigners } from "@/lib/selfie/queries";
import { SelfieAvatar } from "@/components/SelfieAvatar";
import SignTrigger from "../SignTrigger";

export const dynamic = "force-dynamic";

function formatSignedAt(d: Date): string {
  const date = d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const time = d
    .toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
    .toLowerCase()
    .replace(/\s+/g, "");
  return `${date} at ${time}`;
}

function VerificationPill({
  method,
}: {
  method: "email" | "sms";
}) {
  const isEmail = method === "email";
  const label = isEmail ? "Email Verified" : "Phone Verified";
  const styles = isEmail
    ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
    : "bg-indigo-50 text-indigo-700 ring-indigo-600/20";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${styles}`}
    >
      <svg
        className="mr-1 h-3 w-3"
        viewBox="0 0 12 12"
        fill="none"
        aria-hidden
      >
        <path
          d="M2.5 6.5L5 9L9.5 3.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {label}
    </span>
  );
}

export default async function SignersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page = "1" } = await searchParams;
  const pageNum = Math.max(1, Number(page) || 1);
  const limit = 100;

  let rows: SignerListItem[] = [];
  let loadFailed = false;
  try {
    rows = await listSignatures(undefined, {
      limit,
      offset: (pageNum - 1) * limit,
    });
  } catch {
    loadFailed = true;
  }

  // Dedupe to one row per signer (the most recent signature wins because
  // listSignatures orders by signed_at desc).
  const seen = new Set<string>();
  const signers = rows.filter((r) => {
    if (seen.has(r.signerId)) return false;
    seen.add(r.signerId);
    return true;
  });

  // Batch-fetch active approved selfies for the visible signers so the
  // table renders thumbnails without an N+1 query per row.
  const activeSelfies = await getActiveSelfiesForSigners(
    signers.map((s) => s.signerId),
  );

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-16 sm:py-24">
      <header className="mb-12 text-center">
        <p className="text-xs font-medium uppercase tracking-[0.25em] text-zinc-500">
          Verified signers
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-950 sm:text-5xl">
          The people behind the signatures
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-pretty text-base leading-7 text-zinc-700">
          Every name below is a real person who has signed the{" "}
          <Link
            href="/"
            className="text-zinc-900 underline underline-offset-4 hover:text-blue-600"
          >
            AI Bill of Rights
          </Link>
          .
        </p>
        {!loadFailed && signers.length > 0 ? (
          <div className="mt-8 flex flex-col items-center gap-2">
            <SignTrigger className="inline-block rounded-full bg-blue-600 px-8 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition-colors hover:bg-blue-700 sm:text-base">
              Sign the AI Bill of Rights
            </SignTrigger>
            <p className="text-xs text-zinc-500">
              Add your name. Verified by email or phone.
            </p>
          </div>
        ) : null}
      </header>

      {loadFailed ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center text-amber-900">
          We couldn&apos;t load the signer list right now. Try again in a
          moment.
        </div>
      ) : signers.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-12 text-center">
          <p className="text-lg font-medium text-zinc-900">No signers yet.</p>
          <p className="mt-2 text-sm text-zinc-600">
            <SignTrigger className="font-semibold text-blue-600 hover:underline">
              Be the first to sign →
            </SignTrigger>
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-zinc-200">
            <thead className="bg-zinc-50">
              <tr>
                <th
                  scope="col"
                  className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-zinc-600"
                >
                  Signer
                </th>
                <th
                  scope="col"
                  className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-zinc-600"
                >
                  Location
                </th>
                <th
                  scope="col"
                  className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-zinc-600"
                >
                  Version
                </th>
                <th
                  scope="col"
                  className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider text-zinc-600"
                >
                  Signed at
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 bg-white">
              {signers.map((signer) => (
                <tr
                  key={signer.signerId}
                  className="transition-colors hover:bg-zinc-50"
                >
                  <td className="px-6 py-4">
                    <Link
                      href={`/signatories/${signer.signerId}`}
                      className="group flex items-center gap-3"
                    >
                      <SelfieAvatar
                        size="sm"
                        signerId={signer.signerId}
                        displayName={signer.displayName}
                        preloadedActiveSelfies={activeSelfies}
                      />
                      <div className="min-w-0">
                        <div className="font-medium text-zinc-950 group-hover:text-blue-600 group-hover:underline">
                          {signer.displayName}
                        </div>
                        {signer.affiliation ? (
                          <div className="mt-0.5 text-xs text-zinc-500">
                            {signer.affiliation}
                          </div>
                        ) : null}
                        <div className="mt-1.5">
                          <VerificationPill method={signer.verificationMethod} />
                        </div>
                      </div>
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-zinc-700">
                    {signer.locationText || (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm">
                    <Link
                      href={`/v/${signer.version}`}
                      className="font-mono text-zinc-700 underline-offset-4 hover:text-blue-600 hover:underline"
                    >
                      v{signer.version}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-right text-sm text-zinc-500">
                    {formatSignedAt(signer.signedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {signers.length === limit ? (
        <div className="mt-8 flex justify-center gap-4">
          {pageNum > 1 ? (
            <Link
              href={`/signers?page=${pageNum - 1}`}
              className="rounded-full border border-zinc-300 px-6 py-2 text-sm font-medium hover:bg-zinc-100"
            >
              ← Previous
            </Link>
          ) : null}
          <Link
            href={`/signers?page=${pageNum + 1}`}
            className="rounded-full border border-zinc-300 px-6 py-2 text-sm font-medium hover:bg-zinc-100"
          >
            Next →
          </Link>
        </div>
      ) : null}

    </main>
  );
}
