"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TabBar } from "@/components/TabBar";
import { HomepageArticles } from "@/app/HomepageArticles";
import { ArticleSelectionContainer } from "@/app/ArticleSelectionContainer";
import { CommentsColumn } from "@/components/CommentsColumn";
import FloatingSignButton from "@/app/FloatingSignButton";
import type { CommentWithSelection, ThreadedComment, SignerForAdminPostAs } from "@/lib/db/queries";

interface Props {
  initialTab: "current" | "proposed";
  currentVersion: string;
  proposedVersion: string;
  baseVersionId: string | null;
  comments: CommentWithSelection[];
  commentsByAnchor: Record<string, CommentWithSelection[]>;
  threadedComments: ThreadedComment[];
  viewerSignerId: string | null;
  isAdmin: boolean;
  signersForAdmin: SignerForAdminPostAs[];
}

export function TabbedDocument({
  initialTab,
  currentVersion,
  proposedVersion,
  baseVersionId,
  comments: _comments,
  commentsByAnchor,
  threadedComments,
  viewerSignerId,
  isAdmin,
  signersForAdmin,
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

  // Clicking outside any highlight span clears the active comment.
  useEffect(() => {
    const el = articleRef.current;
    if (!el) return;
    function onClickOutside(e: MouseEvent) {
      const target = e.target as HTMLElement;
      // Highlight spans have data-highlight="true"
      if (target.closest("[data-highlight]")) return;
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

        <div className="grid gap-8 md:grid-cols-[1fr_360px] lg:grid-cols-[1fr_540px]">
          {/* Left: article column */}
          <div ref={articleRef} className="relative sm:px-12">
            {/* Fading vertical side lines constrained to the article column */}
            <div className="pointer-events-none absolute inset-y-0 left-0 w-px bg-gradient-to-b from-zinc-300 via-zinc-300/30 to-transparent" />
            <div className="pointer-events-none absolute inset-y-0 right-0 w-px bg-gradient-to-b from-zinc-300 via-zinc-300/30 to-transparent" />

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
              threadedComments={threadedComments}
              activeCommentId={activeCommentId}
              viewerSignerId={viewerSignerId}
              isAdmin={isAdmin}
              signersForAdmin={signersForAdmin}
              onActiveChange={handleActiveChange}
            />
          </aside>
        </div>
      </div>

      {/* Floating Sign button is for the Current tab only — the Proposed tab
          is a working draft, and the sign action belongs to the published doc. */}
      {activeTab === "current" && <FloatingSignButton />}
    </>
  );
}
