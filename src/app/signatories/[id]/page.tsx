import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import {
  getSignerById,
  listSignaturesForSigner,
} from "@/lib/db/queries";
import { getActiveSelfieForSigner } from "@/lib/selfie/queries";
import { VerificationBadge } from "@/components/VerificationBadge";
import { ShareSignature } from "@/components/ShareSignature";
import { CommitmentsSummary } from "@/components/CommitmentsSummary";
import { SelfieAvatar } from "@/components/SelfieAvatar";
import { ReportSelfieButton } from "@/components/ReportSelfieButton";
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
  const ogUrl = `/api/og/signer/${id}`;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "profile",
      images: [{ url: ogUrl, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogUrl],
    },
  };
}

/**
 * This route is the destination of every share the site produces, so most of
 * its traffic is strangers, not the signer. It is therefore built as a landing
 * page for a first-time visitor: who signed and why → what the AI Bill of
 * Rights actually says → add your name. Provenance (which versions were
 * signed) is real but meaningless to a newcomer, so it sits below the
 * conversion path. The owner instead gets the share box and the revoke link —
 * "share your signature" is only a sensible ask of the person who signed.
 */
export default async function SignerProfile({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const signer = await getSignerById(id);
  if (!signer) notFound();
  const sigs = await listSignaturesForSigner(id);
  const activeSelfie = await getActiveSelfieForSigner(signer.id);

  const { userId } = await auth();
  const isOwner = Boolean(userId) && userId === signer.clerkUserId;
  const isSignedInViewer = Boolean(userId);
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://ai-for-people.org";

  const whyISigned: string | null =
    typeof signer.whyISigned === "string" && signer.whyISigned.trim().length > 0
      ? signer.whyISigned.trim()
      : null;

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

      <div className="mt-4 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
        <SelfieAvatar
          size="md"
          signerId={signer.id}
          displayName={signer.displayName}
        />
        <div>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
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
        </div>
      </div>

      {whyISigned ? (
        <figure className="mt-8 border-l-4 border-blue-600 pl-5">
          {/*
            The statement is capped at 200 characters server-side, but at this
            size that is still six lines on a 375px phone, which pushed the
            sign CTA — the point of this page — past the fold: measured in
            Chrome at 375x667, the CTA's bottom edge sat at 682px unclamped
            vs. 632px with `line-clamp-4`. Clamping the quote is what keeps
            the ask reachable without scrolling. The `text-lg` mobile step
            fits more of the statement inside those four lines; from `sm` up
            a full 200-character statement fits in four lines uncut, so the
            clamp never bites there. The clamp is visual only — the full text
            stays in the DOM for crawlers and screen readers.
          */}
          <blockquote className="line-clamp-4 text-lg leading-snug text-zinc-900 sm:text-2xl">
            &ldquo;{whyISigned}&rdquo;
          </blockquote>
          <figcaption className="mt-3 text-sm text-zinc-500">
            — {signer.displayName}, on why they signed
          </figcaption>
        </figure>
      ) : null}

      {isOwner ? (
        <ShareSignature signerId={signer.id} siteUrl={siteUrl} />
      ) : (
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
            Join {signer.displayName} and the earliest signers demanding
            human-centered AI. It takes about a minute.
          </p>
          <div className="mt-6">
            <SignTrigger className="inline-block rounded-full bg-blue-600 px-8 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition-colors hover:bg-blue-700 sm:text-base">
              Sign the AI Bill of Rights
            </SignTrigger>
          </div>
        </section>
      )}

      <CommitmentsSummary
        className="mt-14"
        heading={isOwner ? "What you signed" : "What they signed"}
      />

      {!isOwner ? (
        <div className="mt-10 text-center">
          <SignTrigger className="inline-block rounded-full bg-blue-600 px-8 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition-colors hover:bg-blue-700 sm:text-base">
            Add your name
          </SignTrigger>
        </div>
      ) : null}

      <section className="mt-14 border-t border-zinc-200 pt-8">
        <h2 className="text-xs font-medium uppercase tracking-[0.25em] text-zinc-500">
          Signature record
        </h2>
        <ul className="mt-3 flex flex-col gap-2">
          {sigs.map((s: { version: string; signedAt: Date }) => (
            <li
              key={s.version + s.signedAt.toISOString()}
              className="rounded-lg border border-zinc-200 px-4 py-3 text-sm"
            >
              <span className="text-zinc-700">
                Signed version{" "}
                <Link
                  href={`/v/${s.version}`}
                  className="font-medium text-zinc-900 underline-offset-4 hover:underline"
                >
                  v{s.version}
                </Link>
              </span>
              <span className="ml-2 text-zinc-500">
                on {s.signedAt.toISOString().slice(0, 10)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {!isOwner && isSignedInViewer && activeSelfie ? (
        <div className="mt-10 text-center">
          <ReportSelfieButton selfieId={activeSelfie.id} />
        </div>
      ) : null}

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
