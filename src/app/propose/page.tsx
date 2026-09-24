import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { getCurrentVersion } from "@/lib/db/queries";
import { listProposedRights, type ProposedRight } from "@/lib/db/proposal-queries";
import { getDb } from "@/lib/db/lazy";
import { classifyDbError, type DbErrorKind } from "@/lib/db/error-kind";
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
 * What the queue section should show. An empty queue and a queue we could not
 * read are different facts and get different screens — see the note on the
 * catch below.
 */
type QueueState =
  | { kind: "ok"; proposals: ProposedRight[] }
  | { kind: "unavailable"; reason: DbErrorKind };

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
  // Signed in to Clerk but with no signer row: the one viewer the server will
  // refuse at submit time. Known here, so the form can say so up front.
  let signedInWithoutSignerRow = false;
  let queue: QueueState = { kind: "ok", proposals: [] };

  if (current) {
    try {
      const { userId } = await auth();
      if (userId) {
        const me = await getDb()
          .select({ id: signers.id })
          .from(signers)
          .where(eq(signers.clerkUserId, userId))
          .limit(1);
        if (me.length > 0) viewerSignerId = me[0].id;
        else signedInWithoutSignerRow = true;
      }
    } catch {
      // auth() can throw at the edges; an anonymous read is the correct fallback.
    }

    try {
      queue = {
        kind: "ok",
        proposals: await listProposedRights(getDb(), {
          baseVersionId: current.id,
          viewerSignerId,
        }),
      };
    } catch (err) {
      // Still no 500 — same posture as loadHomepageTabData. But NOT a silent
      // empty list: this page selects `proposed_edits.title`, added by
      // drizzle/0011, and migrations here are applied by hand. Swallowing the
      // error made an un-migrated deploy and a database outage both render as
      // "Nothing proposed yet", so neither could be told from a queue that is
      // simply empty, and neither would ever be noticed.
      const reason = classifyDbError(err);
      console.error(
        `[propose] proposal queue unavailable (${reason}); rendering the ` +
          `unavailable state instead of an empty queue.`,
        reason === "schema"
          ? "Has drizzle/0011_new_article_proposals.sql been applied? See README post-deploy steps."
          : "",
        err,
      );
      queue = { kind: "unavailable", reason };
    }
  }

  const proposals = queue.kind === "ok" ? queue.proposals : [];

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
          <ProposeRightForm needsSignature={signedInWithoutSignerRow} />
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

          {queue.kind === "unavailable" ? (
            <QueueUnavailable reason={queue.reason} />
          ) : proposals.length === 0 ? (
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

/**
 * Shown when the queue could not be read at all. Deliberately NOT the dashed
 * "nothing proposed yet" box: a reader who sees this must not conclude that
 * nobody has proposed anything, and an operator seeing it on a fresh deploy
 * should suspect the hand-applied migration before suspecting an empty table.
 *
 * Solid amber rather than dashed grey so the two states are distinguishable at
 * a glance, and the form above stays usable either way.
 */
function QueueUnavailable({ reason }: { reason: DbErrorKind }) {
  return (
    <div
      role="status"
      className="mt-10 rounded-lg border border-amber-300 bg-amber-50 px-6 py-10 text-center"
    >
      <p className="text-base font-medium text-amber-900">
        The queue of proposals could not be loaded.
      </p>
      <p className="mx-auto mt-2 max-w-md text-pretty text-sm leading-relaxed text-amber-800">
        {reason === "schema"
          ? "This deploy is not finished setting up, so existing proposals cannot be listed yet. This is not an empty queue — nothing has been lost."
          : "We could not reach the database just now. This is not an empty queue — try again in a moment."}
      </p>
      <p className="mt-3 text-xs text-amber-700">
        You can still write a proposal above; it will appear here once the
        listing recovers.
      </p>
    </div>
  );
}
