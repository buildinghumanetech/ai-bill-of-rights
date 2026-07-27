import { verifyAttestationToken } from "@/server/attestations/core";
import { getDb } from "@/lib/db/lazy";

export const dynamic = "force-dynamic";

export default async function VerifyPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  let outcome: "published" | "review" | "error" = "error";
  let errorMessage = "";
  try {
    const result = await verifyAttestationToken(getDb(), token);
    outcome = result.published ? "published" : "review";
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Unknown error";
  }

  return (
    <main className="mx-auto w-full max-w-xl px-6 py-24 text-center">
      {outcome === "published" ? (
        <>
          <h1 className="text-3xl font-semibold tracking-tight">Confirmed.</h1>
          <p className="mt-4 text-zinc-700">
            Your attestation is now public. Thanks for committing.
          </p>
          <a
            href="/attestations"
            className="mt-8 inline-block rounded-full bg-zinc-900 px-6 py-3 text-sm font-medium text-white"
          >
            See all attestations
          </a>
        </>
      ) : outcome === "review" ? (
        <>
          <h1 className="text-3xl font-semibold tracking-tight">Confirmed — pending review.</h1>
          <p className="mt-4 text-zinc-700">
            Your email is confirmed. Because your organization name matches a
            high-profile AI lab, we&apos;ll review the attestation manually
            before publishing it. We&apos;ll email you when it goes live (or if
            we have a question).
          </p>
        </>
      ) : (
        <>
          <h1 className="text-3xl font-semibold tracking-tight text-red-700">
            Link not valid
          </h1>
          <p className="mt-4 text-zinc-700">
            {errorMessage || "This verification link is unknown or expired."}
          </p>
        </>
      )}
    </main>
  );
}
