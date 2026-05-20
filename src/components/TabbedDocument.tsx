"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TabBar } from "@/components/TabBar";
import { HomepageArticles } from "@/app/HomepageArticles";
import { ArticleSelectionContainer } from "@/app/ArticleSelectionContainer";
import { CommentsColumn } from "@/components/CommentsColumn";
import type { CommentWithSelection } from "@/lib/db/queries";

interface Props {
  initialTab: "current" | "proposed";
  currentVersion: string;
  proposedVersion: string;
  baseVersionId: string | null;
  comments: CommentWithSelection[];
  commentsByAnchor: Record<string, CommentWithSelection[]>;
}

export function TabbedDocument({
  initialTab,
  currentVersion,
  proposedVersion,
  baseVersionId,
  comments,
  commentsByAnchor,
}: Props) {
  const [activeTab, setActiveTab] = useState<"current" | "proposed">(initialTab);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const articleRef = useRef<HTMLDivElement | null>(null);

  // Back/forward buttons should swap tabs without a navigation.
  useEffect(() => {
    const onPopState = () => {
      const path = window.location.pathname;
      setActiveTab(path === "/proposed" ? "proposed" : "current");
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // Clicking outside any highlight button clears the active comment.
  useEffect(() => {
    const el = articleRef.current;
    if (!el) return;
    function onClickOutside(e: MouseEvent) {
      const target = e.target as HTMLElement;
      // Highlight buttons are <button> children with bg-cyan-* classes
      if (target.closest("button[data-highlight]")) return;
      setActiveCommentId(null);
    }
    el.addEventListener("click", onClickOutside);
    return () => el.removeEventListener("click", onClickOutside);
  }, []);

  function handleTabChange(tab: "current" | "proposed") {
    setActiveTab(tab);
    const newPath = tab === "current" ? "/" : "/proposed";
    if (window.location.pathname !== newPath) {
      window.history.pushState(null, "", newPath);
    }
  }

  const handleHighlightClick = useCallback((id: string) => {
    setActiveCommentId(id);
  }, []);

  const handleActiveChange = useCallback((id: string | null) => {
    setActiveCommentId(id);
  }, []);

  return (
    <>
      {/* Current tab — full-width, single-column */}
      <div className={activeTab === "current" ? "relative mx-auto mt-8 max-w-3xl" : "hidden"}>
        <TabBar
          active={activeTab}
          currentVersion={currentVersion}
          proposedVersion={proposedVersion}
          onTabChange={handleTabChange}
        />
        <div className="relative sm:px-12">
          <div className="pointer-events-none absolute inset-y-0 left-0 w-px bg-gradient-to-b from-zinc-300 via-zinc-300/30 to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-px bg-gradient-to-b from-zinc-300 via-zinc-300/30 to-transparent" />
          <HomepageArticles mode="static" />
        </div>
      </div>

      {/* Proposed tab — two-column grid on md+ */}
      <div className={activeTab === "proposed" ? "relative mx-auto mt-8 max-w-6xl" : "hidden"}>
        <TabBar
          active={activeTab}
          currentVersion={currentVersion}
          proposedVersion={proposedVersion}
          onTabChange={handleTabChange}
        />

        <div className="grid gap-8 md:grid-cols-[1fr_360px]">
          {/* Left: article column */}
          <div ref={articleRef} className="relative sm:px-12">
            {/* Fading vertical side lines constrained to the article column */}
            <div className="pointer-events-none absolute inset-y-0 left-0 w-px bg-gradient-to-b from-zinc-300 via-zinc-300/30 to-transparent" />
            <div className="pointer-events-none absolute inset-y-0 right-0 w-px bg-gradient-to-b from-zinc-300 via-zinc-300/30 to-transparent" />

            <p className="mx-auto mb-8 max-w-3xl px-6 pt-6 text-center text-sm text-zinc-500">
              Working draft · v{proposedVersion} · Highlight any text to leave a comment
            </p>
            <ArticleSelectionContainer>
              <HomepageArticles
                mode="interactive"
                commentsByAnchor={commentsByAnchor}
                activeCommentId={activeCommentId}
                onHighlightClick={handleHighlightClick}
              />
            </ArticleSelectionContainer>
          </div>

          {/* Right: sticky comments column */}
          <aside className="md:sticky md:top-4 md:self-start">
            <CommentsColumn
              baseVersionId={baseVersionId}
              comments={comments}
              activeCommentId={activeCommentId}
              onActiveChange={handleActiveChange}
            />
          </aside>
        </div>
      </div>
    </>
  );
}
