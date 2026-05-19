import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import {
  getSignerById,
  listSignaturesForSigner,
} from "@/lib/db/queries";
import { VerificationBadge } from "@/components/VerificationBadge";
import { ShareSignature } from "@/components/ShareSignature";
import SignTrigger from "../../SignTrigger";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const signer = await getSignerById(id);
  if (!signer) return { title: "Signer not found" };
  const title = `${signer.displayName} signed the AI Bill of Rights`;
  const description = `${signer.displayName} is one of a growing number of people demanding human-centered AI. Read the document and add your name.`;
  return {
    title,
    description,
    openGraph: { title, description, type: "profile" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function SignerProfile({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const signer = await getSignerById(id);
  if (!signer) notFound();
  const sigs = await listSignaturesForSigner(id);

  const { userId } = await auth();
  const isOwner = Boolean(userId) && userId === signer.clerkUserId;
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://ai-for-people.org";
  const signatureUrl = `${siteUrl}/signatories/${signer.id}`;

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-16 pb-32 sm:py-24">
      <p className="text-xs font-medium uppercase tracking-[0.25em] text-zinc-500">
        A signer of the{" "}
        <Link
          href="/"
          className="text-zinc-700 underline-offset-4 hover:text-zinc-900 hover:underline"
        >
          AI Bill of Rights
        </Link>
      </p>

      <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-2">
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-950 sm:text-5xl">
          {signer.displayName}
        </h1>
        <VerificationBadge
          method={signer.verificationMethod as "email" | "sms"}
        />
      </div>

      {signer.locationText || signer.affiliation ? (
        <div className="mt-2 text-sm text-zinc-600">
          {[signer.locationText, signer.affiliation]
            .filter(Boolean)
            .join(" · ")}
        </div>
      ) : null}

      <section className="mt-10">
        <h2 className="text-xs font-medium uppercase tracking-[0.25em] text-zinc-500">
          Signed versions
        </h2>
        <ul className="mt-3 flex flex-col gap-2">
          {sigs.map((s: { version: string; signedAt: Date }) => (
            <li
              key={s.version + s.signedAt.toISOString()}
              className="rounded-lg border border-zinc-200 px-4 py-3"
            >
              <Link
                href={`/v/${s.version}`}
                className="font-medium text-zinc-900 underline-offset-4 hover:underline"
              >
                v{s.version}
              </Link>
              <span className="ml-2 text-sm text-zinc-500">
                on {s.signedAt.toISOString().slice(0, 10)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <ShareSignature
        displayName={signer.displayName}
        signatureUrl={signatureUrl}
      />

      <section className="mt-10 rounded-2xl border border-zinc-200 bg-zinc-50 p-7 text-center">
        <h2 className="text-xl font-semibold tracking-tight text-zinc-950 sm:text-2xl">
          Add your name to the{" "}
          <Link
            href="/"
            className="underline underline-offset-4 hover:text-zinc-700"
          >
            AI Bill of Rights
          </Link>
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-zinc-700">
          Nine commitments we&apos;re demanding from every AI company.
          <br />
          Join {signer.displayName} as a signer.
        </p>
        <div className="mt-6">
          <SignTrigger className="inline-block rounded-full bg-blue-600 px-8 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition-colors hover:bg-blue-700 sm:text-base">
            Sign the AI Bill of Rights
          </SignTrigger>
        </div>
      </section>

      {isOwner ? (
        <p className="mt-14 text-center text-xs text-zinc-500">
          Your data, your choice.{" "}
          <Link
            href="/account/revoke"
            className="underline underline-offset-4"
          >
            Remove your signature
          </Link>{" "}
          any time.
        </p>
      ) : null}
    </main>
  );
}
