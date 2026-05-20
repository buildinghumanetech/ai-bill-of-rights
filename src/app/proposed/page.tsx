import Link from "next/link";
import HeroSection from "@/app/HeroSection";
import FloatingSignButton from "@/app/FloatingSignButton";
import SignatureCount from "@/app/SignatureCount";
import { TabBar } from "@/components/TabBar";
import { HomepageArticles } from "@/app/HomepageArticles";
import { ArticleSelectionContainer } from "@/app/ArticleSelectionContainer";
import { CommentDrawer } from "@/components/CommentDrawer";
import { HighlightPopover } from "@/components/HighlightPopover";
import {
  countCommentsByAnchor,
  listCommentsForAnchor,
  getCurrentVersion,
} from "@/lib/db/queries";

export const dynamic = "force-dynamic";

/** Bumps the patch segment of a semver string: "0.0.1" → "0.0.2". */
function bumpPatch(version: string): string {
  const parts = version.split(".");
  if (parts.length < 3) return version;
  const patch = parseInt(parts[2] ?? "0", 10);
  return `${parts[0]}.${parts[1]}.${patch + 1}`;
}

export default async function ProposedPage() {
  const current = await getCurrentVersion().catch(() => null);

  let currentVersion = current?.version ?? "0.0.1";
  const proposedVersion = bumpPatch(currentVersion);

  let anchorCounts: Record<string, number> = {};
  const commentsByAnchor: Record<
    string,
    Awaited<ReturnType<typeof listCommentsForAnchor>>
  > = {};

  if (current) {
    try {
      anchorCounts = await countCommentsByAnchor(undefined as any, current.id);
      for (const anchorId of Object.keys(anchorCounts)) {
        commentsByAnchor[anchorId] = await listCommentsForAnchor(
          undefined as any,
          current.id,
          anchorId,
        );
      }
    } catch {
      // DB unreachable in preview — fall through with empty maps.
    }
  }

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
          Working draft · v{proposedVersion} · Hover any sentence to comment
        </p>

        <TabBar
          active="proposed"
          currentVersion={currentVersion}
          proposedVersion={proposedVersion}
        />

        <ArticleSelectionContainer>
          <HomepageArticles mode="interactive" anchorCounts={anchorCounts} />
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

      <HighlightPopover enableSuggestChanges={false} />
      {current ? (
        <CommentDrawer
          baseVersionId={current.id}
          commentsByAnchor={commentsByAnchor}
        />
      ) : null}
    </div>
  );
}
