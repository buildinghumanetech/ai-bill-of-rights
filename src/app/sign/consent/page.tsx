import { auth } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { signers } from "@/lib/db/schema";
import { extractCapturedFields } from "@/lib/fingerprint/extract";
import { renderConsentText, CURRENT_CONSENT_VERSION } from "@/lib/consent/render";
import { submitSignAction } from "@/server/actions/sign";

export const dynamic = "force-dynamic";

export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ version?: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/");
  const { version = "0.0.1" } = await searchParams;

  const rows = await db
    .select()
    .from(signers)
    .where(eq(signers.clerkUserId, userId))
    .limit(1);
  if (rows.length === 0) {
    redirect(`/sign/profile?version=${encodeURIComponent(version)}`);
  }
  const signer = rows[0];

  const sessionUtc = new Date().toISOString();
  const h = await headers();
  const fields = extractCapturedFields(h, {
    sessionUtc,
  });
  const consentText = renderConsentText(CURRENT_CONSENT_VERSION, {
    displayName: signer.displayName,
    location: signer.locationText ?? "",
    affiliation: signer.affiliation ?? "",
    verificationMethod: signer.verificationMethod as "email" | "sms",
    fields,
  });

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">
        Sign — Step 2 of 2
      </h1>
      <article className="prose prose-zinc mt-8 max-w-none whitespace-pre-wrap">
        {consentText}
      </article>
      <form action={submitSignAction} className="mt-10 flex flex-col gap-6">
        <input type="hidden" name="version" value={version} />
        <input type="hidden" name="signing_session_utc" value={sessionUtc} />
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            name="consent"
            value="yes"
            required
            className="mt-1 h-5 w-5"
          />
          <span className="text-sm">
            I have read the above and consent to this record being created.
          </span>
        </label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="submit"
            className="rounded-full bg-zinc-900 px-6 py-3 text-base font-medium text-white hover:bg-zinc-700"
          >
            Sign as {signer.displayName}
          </button>
          <a
            href={`/v/${version}`}
            className="rounded-full px-6 py-3 text-base font-medium text-zinc-700 hover:bg-zinc-100"
          >
            Cancel
          </a>
        </div>
      </form>
    </main>
  );
}
