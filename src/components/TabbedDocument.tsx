"use client";

import { useEffect, useState } from "react";
import { TabBar } from "@/components/TabBar";
import { HomepageArticles, articles } from "@/app/HomepageArticles";
import { ArticleSelectionContainer } from "@/app/ArticleSelectionContainer";
import { ProposalDrawer } from "@/components/ProposalDrawer";
import { HighlightPopover } from "@/components/HighlightPopover";
import { EndorseButton } from "@/components/EndorseButton";
import { applyEdits } from "@/lib/proposed/apply-edits";
import type { ProposalRow } from "@/lib/db/queries";

interface Props {
  initialTab: "current" | "proposed";
  currentVersion: string;
  proposedVersion: string;
  baseVersionId: string | null;
  proposalCounts: Record<string, { pending: number; accepted: number }>;
  proposalsByAnchor: Record<string, ProposalRow[]>;
  acceptedProposals: ProposalRow[];
  isAdmin: boolean;
  initialEndorsed: boolean;
  endorserCount: number;
}

// Must match the splitter in HomepageArticles.tsx exactly.
function splitSentences(body: string): string[] {
  return body
    .split(/(?<=[.!?])\s+(?=[A-Z"„])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

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

export function TabbedDocument({
  initialTab,
  currentVersion,
  proposedVersion,
  baseVersionId,
  proposalCounts,
  proposalsByAnchor,
  acceptedProposals,
  isAdmin,
  initialEndorsed,
  endorserCount,
}: Props) {
  const [activeTab, setActiveTab] = useState<"current" | "proposed">(initialTab);

  // Back/forward buttons should swap tabs without a navigation.
  useEffect(() => {
    const onPopState = () => {
      const path = window.location.pathname;
      setActiveTab(path === "/proposed" ? "proposed" : "current");
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  function handleTabChange(tab: "current" | "proposed") {
    setActiveTab(tab);
    const newPath = tab === "current" ? "/" : "/proposed";
    if (window.location.pathname !== newPath) {
      window.history.pushState(null, "", newPath);
    }
  }

  const anchorCounts: Record<string, number> = {};
  for (const [anchorId, counts] of Object.entries(proposalCounts)) {
    anchorCounts[anchorId] = counts.pending + counts.accepted;
  }
  const editsByAnchor = applyEdits(acceptedProposals);

  return (
    <>
      <div className="relative mx-auto mt-8 max-w-3xl">
        <TabBar
          active={activeTab}
          currentVersion={currentVersion}
          proposedVersion={proposedVersion}
          onTabChange={handleTabChange}
        />

        <div className="relative">
          {/* Fading vertical side lines spanning the article area. */}
          <div className="pointer-events-none absolute inset-y-0 left-0 w-px bg-gradient-to-b from-zinc-300 via-zinc-300/30 to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-px bg-gradient-to-b from-zinc-300 via-zinc-300/30 to-transparent" />

          {/* Current — static. Always mounted to keep tab switching instant. */}
          <div className={activeTab === "current" ? "" : "hidden"}>
            <HomepageArticles mode="static" />
          </div>

          {/* Proposed — interactive. Always mounted; only popover/drawer below
              are gated on the active tab to avoid global listeners firing while
              the proposed view is hidden. */}
          <div className={activeTab === "proposed" ? "" : "hidden"}>
            <p className="mx-auto mb-4 max-w-3xl px-6 pt-6 text-center text-sm text-zinc-500">
              Working draft · v{proposedVersion} · Hover any sentence to propose a change
            </p>
            {baseVersionId && (
              <div className="mb-8 flex justify-center">
                <EndorseButton
                  baseVersionId={baseVersionId}
                  initialEndorsed={initialEndorsed}
                  endorserCount={endorserCount}
                />
              </div>
            )}
            <ArticleSelectionContainer>
              <HomepageArticles
                mode="interactive"
                anchorMode="proposals"
                anchorCounts={anchorCounts}
                editsByAnchor={editsByAnchor}
                proposalCounts={proposalCounts}
              />
            </ArticleSelectionContainer>
          </div>
        </div>
      </div>

      {activeTab === "proposed" && (
        <>
          <HighlightPopover enableSuggestChanges={true} />
          {baseVersionId && (
            <ProposalDrawer
              baseVersionId={baseVersionId}
              proposalsByAnchor={proposalsByAnchor}
              originalTextByAnchor={buildOriginalTextByAnchor()}
              isAdmin={isAdmin}
            />
          )}
        </>
      )}
    </>
  );
}
