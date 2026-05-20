import Link from "next/link";
import HeroSection from "@/app/HeroSection";
import FloatingSignButton from "@/app/FloatingSignButton";
import SignatureCount from "@/app/SignatureCount";
import { TabBar } from "@/components/TabBar";
import { HomepageArticles, articles } from "@/app/HomepageArticles";
import { ArticleSelectionContainer } from "@/app/ArticleSelectionContainer";
import { ProposalDrawer } from "@/components/ProposalDrawer";
import { HighlightPopover } from "@/components/HighlightPopover";
import {
  countProposalsByAnchor,
  listProposalsByAnchor,
  getAcceptedProposalsForVersion,
  getCurrentVersion,
  type ProposalRow,
} from "@/lib/db/queries";
import { applyEdits } from "@/lib/proposed/apply-edits";
import { getCurrentAdmin } from "@/lib/admin/check";

export const dynamic = "force-dynamic";

/** Bumps the patch segment of a semver string: "0.0.1" → "0.0.2". */
function bumpPatch(version: string): string {
  const parts = version.split(".");
  if (parts.length < 3) return version;
  const patch = parseInt(parts[2] ?? "0", 10);
  return `${parts[0]}.${parts[1]}.${patch + 1}`;
}

/**
 * Naive sentence splitter matching the one in HomepageArticles.tsx.
 * Must be kept in sync.
 */
function splitSentences(body: string): string[] {
  return body
    .split(/(?<=[.!?])\s+(?=[A-Z"„])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Build originalTextByAnchor from the articles[] array.
 * Maps "article-NN-s-I" → sentence text, matching the anchorId scheme
 * used by HomepageArticles interactive mode.
 */
function buildOriginalTextByAnchor(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const article of articles) {
    const sentences = splitSentences(article.body);
    sentences.forEach((sentence, idx) => {
      map[`article-${article.number}-s-${idx + 1}`] = sentence;
    });
  }
  return map;
}

export default async function ProposedPage() {
  const current = await getCurrentVersion().catch(() => null);

  const currentVersion = current?.version ?? "0.0.1";
  const proposedVersion = bumpPatch(currentVersion);

  const originalTextByAnchor = buildOriginalTextByAnchor();

  // Determine if visitor is an admin (used to show Accept/Reject buttons).
  const adminCtx = await getCurrentAdmin().catch(() => null);
  const isAdmin = adminCtx?.state === "admin";

  let proposalCounts: Record<string, { pending: number; accepted: number }> = {};
  const proposalsByAnchor: Record<string, ProposalRow[]> = {};
  let acceptedProposals: ProposalRow[] = [];

  if (current) {
    try {
      proposalCounts = await countProposalsByAnchor(undefined as any, current.id);

      // Fetch proposal lists for every anchor that has proposals.
      const anchorIds = Object.keys(proposalCounts);
      await Promise.all(
        anchorIds.map(async (anchorId) => {
          proposalsByAnchor[anchorId] = await listProposalsByAnchor(
            undefined as any,
            current.id,
            anchorId,
          );
        }),
      );

      acceptedProposals = await getAcceptedProposalsForVersion(
        undefined as any,
        current.id,
      );
    } catch {
      // DB unreachable in preview — fall through with empty maps.
    }
  }

  // Build per-anchor count for the badge (total pending + accepted).
  const anchorCounts: Record<string, number> = {};
  for (const [anchorId, counts] of Object.entries(proposalCounts)) {
    anchorCounts[anchorId] = counts.pending + counts.accepted;
  }

  const editsByAnchor = applyEdits(acceptedProposals);

  return (
    <div className="flex-1">
      <section className="bg-white px-6 pt-14 pb-10 text-center sm:pt-20 sm:pb-14">
        <h1 className="text-balance text-5xl font-semibold tracking-tight text-zinc-950 sm:text-7xl">
          The AI Bill of Rights
        </h1>
        <p className="mx-auto mt-6 max-w-none text-pretty text-xl leading-8 text-zinc-700 sm:text-2xl">
          <strong className="font-semibold text-zinc-950 sm:whitespace-nowrap">
            Nine commitments we&apos;re demanding from every AI company
          </strong>
          <br />
          with{" "}
          <Link
            href="/signers"
            className="font-bold text-blue-600 hover:underline"
          >
            <SignatureCount /> signatures
          </Link>{" "}
          to back them up.
        </p>
      </section>

      <HeroSection />

      <section className="bg-white px-6 pb-32 pt-10 sm:pt-14">
        <p className="mx-auto max-w-5xl text-center text-pretty text-2xl font-semibold leading-snug text-zinc-900 sm:text-3xl">
          Join{" "}
          <Link
            href="/signers"
            className="font-bold text-blue-600 hover:underline"
          >
            <SignatureCount /> other real people
          </Link>{" "}
          who have signed this AI Bill of Rights
        </p>
        <p className="mx-auto mb-2 mt-3 max-w-5xl text-center text-base leading-relaxed text-zinc-600">
          <Link
            href="/about"
            className="text-zinc-700 underline underline-offset-4 hover:text-blue-600"
          >
            Who created this?
          </Link>
        </p>

        {/* Working draft banner */}
        <p className="mx-auto mb-8 max-w-3xl text-center text-sm text-zinc-500">
          Working draft · v{proposedVersion} · Hover any sentence to propose a change
        </p>

        <TabBar
          active="proposed"
          currentVersion={currentVersion}
          proposedVersion={proposedVersion}
        />

        <ArticleSelectionContainer>
          <HomepageArticles
            mode="interactive"
            anchorMode="proposals"
            anchorCounts={anchorCounts}
            editsByAnchor={editsByAnchor}
            proposalCounts={proposalCounts}
          />
        </ArticleSelectionContainer>
      </section>

      <section className="border-t border-zinc-200 bg-zinc-50 px-6 py-24 text-center">
        <div className="mx-auto max-w-2xl">
          <p className="text-xs font-medium uppercase tracking-[0.25em] text-zinc-500">
            Version {proposedVersion} — working draft
          </p>
          <p className="mt-6 text-pretty text-xl leading-relaxed text-zinc-900 sm:text-2xl">
            These nine commitments aren&apos;t a wishlist. They&apos;re the
            line. Companies that won&apos;t agree to them are telling you
            who they are.
          </p>
          <div className="mt-10 flex flex-col items-center gap-6">
            <Link
              href="/v/0.0.1/as-code"
              className="text-sm text-zinc-600 underline underline-offset-8 hover:text-zinc-900"
            >
              Building AI? Implement this in your code →
            </Link>
          </div>
        </div>
      </section>

      <FloatingSignButton />

      <HighlightPopover enableSuggestChanges={true} />
      {current ? (
        <ProposalDrawer
          baseVersionId={current.id}
          proposalsByAnchor={proposalsByAnchor}
          originalTextByAnchor={originalTextByAnchor}
          isAdmin={isAdmin}
        />
      ) : null}
    </div>
  );
}
