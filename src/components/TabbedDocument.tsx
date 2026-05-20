"use client";

import { useEffect, useState } from "react";
import { TabBar } from "@/components/TabBar";
import { HomepageArticles } from "@/app/HomepageArticles";
import { ArticleSelectionContainer } from "@/app/ArticleSelectionContainer";
import { HighlightPopover } from "@/components/HighlightPopover";

interface Props {
  initialTab: "current" | "proposed";
  currentVersion: string;
  proposedVersion: string;
  baseVersionId: string | null;
}

export function TabbedDocument({
  initialTab,
  currentVersion,
  proposedVersion,
  baseVersionId,
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

  return (
    <>
      <div className="relative mx-auto mt-8 max-w-3xl">
        <TabBar
          active={activeTab}
          currentVersion={currentVersion}
          proposedVersion={proposedVersion}
          onTabChange={handleTabChange}
        />

        <div className="relative sm:px-12">
          {/* Fading vertical side lines spanning the article area. */}
          <div className="pointer-events-none absolute inset-y-0 left-0 w-px bg-gradient-to-b from-zinc-300 via-zinc-300/30 to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-px bg-gradient-to-b from-zinc-300 via-zinc-300/30 to-transparent" />

          {/* Current — static. Always mounted to keep tab switching instant. */}
          <div className={activeTab === "current" ? "" : "hidden"}>
            <HomepageArticles mode="static" />
          </div>

          {/* Proposed — interactive. Highlighting a sentence opens the
              `<HighlightPopover>` for inline commenting. */}
          <div className={activeTab === "proposed" ? "" : "hidden"}>
            <p className="mx-auto mb-8 max-w-3xl px-6 pt-6 text-center text-sm text-zinc-500">
              Working draft · v{proposedVersion} · Highlight any text to leave a comment
            </p>
            <ArticleSelectionContainer>
              <HomepageArticles mode="interactive" />
            </ArticleSelectionContainer>
          </div>
        </div>
      </div>

      {activeTab === "proposed" && (
        <HighlightPopover baseVersionId={baseVersionId} />
      )}
    </>
  );
}
