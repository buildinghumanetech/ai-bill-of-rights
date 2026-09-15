import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { getCurrentVersion } from "@/lib/db/queries";
import { listProposedRights, type ProposedRight } from "@/lib/db/proposal-queries";
import { signers } from "@/lib/db/schema";
import { ProposeRightForm } from "@/components/ProposeRightForm";
import { ProposedRightCard } from "@/components/ProposedRightCard";
import SignModalClient from "./SignModalClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Propose a new right — The AI Bill of Rights",
  description:
    "The document has eleven articles. If one is missing, propose it here and let the signers decide.",
};

/**
 * The gap this page fills: /proposed lets anyone comment on or reword a line
 * that already exists, and there was no way at all to say "a whole right is
 * missing". Every such suggestion arrived as a comment anchored to whatever
 * sentence happened to be nearest, where it could not be counted, could not be
 * endorsed, and read as a rewrite of a line nobody had proposed rewriting.
 */
export default async function ProposePage() {
  const current = await getCurrentVersion().catch(() => null);

  let viewerSignerId: string | null = null;
  let proposals: ProposedRight[] = [];

  if (current) {
    try {
      const { userId } = await auth();
      if (userId) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { db } = require("@/lib/db") as { db: any };
        const me = await db
          .select({ id: signers.id })
          .from(signers)
          .where(eq(signers.clerkUserId, userId))
          .limit(1);
        if (me.length > 0) viewerSignerId = me[0].id;
      }
    } catch {
      // auth() can throw at the edges; an anonymous read is the correct fallback.
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { db } = require("@/lib/db") as { db: any };
      proposals = await listProposedRights(db, {
        baseVersionId: current.id,
        viewerSignerId,
      });
    } catch {
      // DB unavailable (preview/test builds) — render the page empty rather
      // than 500ing, same posture as loadHomepageTabData.
    }
  }

  return (
    <div className="flex-1 bg-white">
      <section className="border-b border-zinc-200 px-6 pt-14 pb-12 text-center sm:pt-20">
        <p className="font-mono text-xs font-medium uppercase tracking-[0.25em] text-zinc-500">
          v{current?.version ?? "0.1.0"} — open draft
        </p>
        <h1 className="mx-auto mt-5 max-w-3xl text-balance text-4xl font-semibold tracking-tight text-zinc-950 sm:text-6xl">
          Propose a new right
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-zinc-700">
          The document has eleven articles. Eleven is not a sacred number — it
          is where the drafting stopped. If a right is missing, write it here.
          Signers endorse the ones that hold up, and those go into the next
          version.
        </p>
        <p className="mx-auto mt-4 max-w-2xl text-pretty text-base leading-relaxed text-zinc-600">
          Changing the wording of a right that already exists?{" "}
          <Link href="/proposed" className="text-blue-600 underline underline-offset-4">
            Comment on the draft instead
          </Link>
          .
        </p>
      </section>

      <section className="mx-auto max-w-3xl px-6 py-14">
        <h2 className="text-2xl font-semibold tracking-tight text-zinc-950">
          Write it
        </h2>
        <p className="mt-2 text-base leading-relaxed text-zinc-600">
          Read the{" "}
          <Link href="/" className="text-blue-600 underline underline-offset-4">
            eleven
          </Link>{" "}
          first. Most proposals turn out to be Article 4 or Article 9 in
          different words, and the fastest way to get yours taken seriously is
          to say plainly why yours is not.
        </p>
        <div className="mt-8">
          <ProposeRightForm />
        </div>
      </section>

      <section className="border-t border-zinc-200 bg-zinc-50 px-6 py-16">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-950">
            On the table
            {proposals.length > 0 && (
              <span className="ml-2 font-mono text-base font-normal text-zinc-500">
                {proposals.length}
              </span>
            )}
          </h2>
          <p className="mt-2 text-base leading-relaxed text-zinc-600">
            Ordered by how many signers have endorsed them. One endorsement per
            signer — the same verified people who signed the document.
          </p>

          {proposals.length === 0 ? (
            <p className="mt-10 rounded-lg border border-dashed border-zinc-300 bg-white px-6 py-12 text-center text-base text-zinc-500">
              Nothing proposed yet. Yours would be the first.
            </p>
          ) : (
            <div className="mt-8 space-y-5">
              {proposals.map((p) => (
                <ProposedRightCard
                  key={p.id}
                  proposal={p}
                  viewerSignerId={viewerSignerId}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Mounted because the form and the endorse button both dispatch
          open-sign-modal, and this route has no TabbedDocument to catch it. */}
      <SignModalClient />
    </div>
  );
}
