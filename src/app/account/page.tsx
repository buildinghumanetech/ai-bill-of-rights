import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { signers } from "@/lib/db/schema";
import { listSignaturesForSigner } from "@/lib/db/queries";

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
        <p className="mt-4 text-zinc-600 dark:text-zinc-400">
          You haven&apos;t completed a profile yet. Visit the document and sign to
          create one.
        </p>
      </main>
    );
  }
  const signer = rows[0];
  const sigs = await listSignaturesForSigner(signer.id);
  const { revoked } = await searchParams;

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Account</h1>
      {revoked ? (
        <p className="mt-4 rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-200">
          Your data has been revoked. Your public signature is now anonymized.
        </p>
      ) : null}
      <section className="mt-8">
        <h2 className="text-xl font-semibold">Public profile</h2>
        <dl className="mt-4 grid grid-cols-3 gap-y-2 text-sm">
          <dt className="text-zinc-500">Display name</dt>
          <dd className="col-span-2">{signer.displayName}</dd>
          <dt className="text-zinc-500">Location</dt>
          <dd className="col-span-2">{signer.locationText ?? "—"}</dd>
          <dt className="text-zinc-500">Affiliation</dt>
          <dd className="col-span-2">{signer.affiliation ?? "—"}</dd>
          <dt className="text-zinc-500">Verification</dt>
          <dd className="col-span-2">{signer.verificationMethod}</dd>
        </dl>
      </section>
      <section className="mt-10">
        <h2 className="text-xl font-semibold">Your signatures</h2>
        <ul className="mt-3 flex flex-col gap-2">
          {sigs.map((s: { version: string; signedAt: Date }) => (
            <li
              key={s.version + s.signedAt.toISOString()}
              className="rounded-md border border-zinc-200 px-4 py-2 text-sm dark:border-zinc-800"
            >
              v{s.version} — signed {s.signedAt.toISOString().slice(0, 10)}
            </li>
          ))}
        </ul>
      </section>
      <section className="mt-10">
        <a
          href="/account/revoke"
          className="text-sm font-medium text-red-700 underline-offset-4 hover:underline dark:text-red-400"
        >
          Revoke my data
        </a>
      </section>
    </main>
  );
}
