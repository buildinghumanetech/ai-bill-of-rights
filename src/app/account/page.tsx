import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { signers } from "@/lib/db/schema";
import { listSignaturesForSigner } from "@/lib/db/queries";
import AccountClient from "./AccountClient";

export const dynamic = "force-dynamic";

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ revoked?: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/");
  const rows = await db
    .select()
    .from(signers)
    .where(eq(signers.clerkUserId, userId))
    .limit(1);
  if (rows.length === 0) {
    return (
      <main className="mx-auto w-full max-w-xl px-6 py-12">
        <h1 className="text-2xl font-semibold">Account</h1>
        <p className="mt-4 text-zinc-600">
          Sign or edit the{" "}
          <Link
            href="/"
            className="font-semibold text-blue-600 underline-offset-4 hover:underline"
          >
            AI Bill of Rights
          </Link>{" "}
          to create an account.
        </p>
      </main>
    );
  }
  const signer = rows[0];
  const sigs = await listSignaturesForSigner(signer.id);
  const { revoked } = await searchParams;

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-16 pb-32">
      {signer.isAdmin ? (
        <Link
          href="/admin"
          className="fixed right-4 top-16 z-40 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-800 shadow-md ring-1 ring-amber-200 hover:bg-amber-100"
        >
          <svg
            className="h-3.5 w-3.5"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden
          >
            <path
              d="M8 1.5l1.5 4h4l-3.25 2.5 1.25 4-3.5-2.5L4.5 12l1.25-4L2.5 5.5h4z"
              fill="currentColor"
            />
          </svg>
          Admin
        </Link>
      ) : null}

      <p className="text-xs font-medium uppercase tracking-[0.25em] text-zinc-500">
        Account
      </p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight text-zinc-950 sm:text-5xl">
        {signer.displayName}
      </h1>

      {revoked ? (
        <p className="mt-4 rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Your signatures and profile have been deleted.
        </p>
      ) : null}

      <AccountClient
        initialDisplayName={signer.displayName}
        initialAffiliation={signer.affiliation}
        initialLocationText={signer.locationText}
        verificationMethod={signer.verificationMethod}
        signatures={sigs.map((s: { version: string; signedAt: Date }) => ({
          version: s.version,
          signedAt: s.signedAt.toISOString(),
        }))}
      />
    </main>
  );
}
