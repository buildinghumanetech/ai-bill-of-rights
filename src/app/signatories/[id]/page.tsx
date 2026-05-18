import { notFound } from "next/navigation";
import {
  getSignerById,
  listSignaturesForSigner,
} from "@/lib/db/queries";
import { VerificationBadge } from "@/components/VerificationBadge";

export const dynamic = "force-dynamic";

export default async function SignerProfile({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const signer = await getSignerById(id);
  if (!signer) notFound();
  const sigs = await listSignaturesForSigner(id);

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-12">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          {signer.displayName}
        </h1>
        <VerificationBadge
          method={signer.verificationMethod as "email" | "sms"}
        />
      </div>
      <div className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        {[signer.locationText, signer.affiliation].filter(Boolean).join(" · ") ||
          "—"}
      </div>
      <h2 className="mt-10 text-xl font-semibold">Signed versions</h2>
      <ul className="mt-3 flex flex-col gap-2">
        {sigs.map((s: { version: string; signedAt: Date }) => (
          <li
            key={s.version + s.signedAt.toISOString()}
            className="rounded-md border border-zinc-200 px-4 py-2 dark:border-zinc-800"
          >
            <a
              href={`/v/${s.version}`}
              className="text-zinc-900 underline-offset-4 hover:underline dark:text-zinc-100"
            >
              v{s.version}
            </a>
            <span className="ml-2 text-sm text-zinc-500">
              on {s.signedAt.toISOString().slice(0, 10)}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-12 text-xs text-zinc-500">
        Your data, your choice.{" "}
        <a href="/account/revoke" className="underline">
          Revoke your signature
        </a>{" "}
        any time.
      </p>
    </main>
  );
}
