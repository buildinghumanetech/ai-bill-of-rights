"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TabBar } from "@/components/TabBar";
import { HomepageArticles } from "@/app/HomepageArticles";
import { ArticleSelectionContainer } from "@/app/ArticleSelectionContainer";
import { CommentsColumn } from "@/components/CommentsColumn";
import FloatingSignButton from "@/app/FloatingSignButton";
import SignModal from "@/app/SignModal";
import type { CommentWithSelection, ThreadedComment, SignerForAdminPostAs, SignerForMention } from "@/lib/db/queries";

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
  signersForMention: SignerForMention[];
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
  signersForMention,
}: Props) {
  const [activeTab, setActiveTab] = useState<"current" | "proposed">(initialTab);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [signModalOpen, setSignModalOpen] = useState(false);
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

  const [signModalMode, setSignModalMode] = useState<"sign" | "comment-only">("comment-only");

  // Listen for open-sign-modal events from anywhere on the page (e.g. CommentNode).
  // This must be always mounted, even on the Proposed tab where FloatingSignButton is hidden.
  // The event detail can carry { mode: "sign" | "comment-only" }; defaults to "comment-only"
  // since this modal instance is primarily triggered by comment actions.
  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<{ mode?: "sign" | "comment-only" } | undefined>).detail;
      setSignModalMode(detail?.mode ?? "comment-only");
      setSignModalOpen(true);
    };
    window.addEventListener("open-sign-modal", onOpen);
    return () => window.removeEventListener("open-sign-modal", onOpen);
  }, []);

  // Handle ?c=<commentId> deep-link: activate the comment and scroll to its highlight.
  useEffect(() => {
    const url = new URL(window.location.href);
    const c = url.searchParams.get("c");
    if (!c) return;
    // Switch to proposed tab
    setActiveTab("proposed");
    setActiveCommentId(c);
    // Scroll to the highlight after a tick so the DOM is settled
    setTimeout(() => {
      const el = document.querySelector(`[data-comment-id="${c}"]`);
      if (el && "scrollIntoView" in el) {
        (el as HTMLElement).scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 100);
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const handlePostedTopLevel = useCallback((newCommentId: string) => {
    setActiveCommentId(newCommentId);
  }, []);

  // Compute max depth of the active comment's subtree for Tweak 4 column widening.
  const maxDepth = (() => {
    const activeComment = activeCommentId
      ? (() => {
          function find(nodes: ThreadedComment[], id: string): ThreadedComment | null {
            for (const n of nodes) {
              if (n.id === id) return n;
              const f = find(n.replies, id);
              if (f) return f;
            }
            return null;
          }
          return find(threadedComments, activeCommentId);
        })()
      : null;
    if (!activeComment) return 0;
    function depth(node: ThreadedComment): number {
      if (node.replies.length === 0) return 0;
      return 1 + Math.max(...node.replies.map(depth));
    }
    return depth(activeComment);
  })();

  // Static grid-template and wrapper-width classes — Tailwind JIT requires static strings.
  // When depth ≥ 3 the right column widens to 720px / 900px, so we also widen the outer
  // wrapper so the tab-bar divider (which spans the wrapper) covers the full grid width.
  const gridClass =
    maxDepth >= 3
      ? "grid gap-8 md:grid-cols-[1fr_360px] lg:grid-cols-[1fr_720px] xl:grid-cols-[1fr_900px]"
      : "grid gap-8 md:grid-cols-[1fr_360px] lg:grid-cols-[1fr_540px]";
  const wrapperClass =
    maxDepth >= 3
      ? "relative mx-auto mt-8 max-w-7xl xl:max-w-[1400px]"
      : "relative mx-auto mt-8 max-w-6xl";

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

      {/* Proposed tab — two-column grid on md+.
          wrapperClass widens the outer wrapper when the right column widens (deep nesting),
          so the TabBar divider (which spans the wrapper) covers the full grid. */}
      <div className={activeTab === "proposed" ? wrapperClass : "hidden"}>
        <TabBar
          active={activeTab}
          currentVersion={currentVersion}
          proposedVersion={proposedVersion}
          onTabChange={handleTabChange}
        />

        <div className={gridClass}>
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
              signersForMention={signersForMention}
              onActiveChange={handleActiveChange}
              onPostedTopLevel={handlePostedTopLevel}
            />
          </aside>
        </div>
      </div>

      {/* Floating Sign button is for the Current tab only — the Proposed tab
          is a working draft, and the sign action belongs to the published doc.
          The SignModal is always mounted (even on the Proposed tab) because
          CommentNode and NewCommentForm dispatch open-sign-modal from any tab,
          and we handle that event here so the modal always responds. */}
      {activeTab === "current" && <FloatingSignButton />}
      <SignModal open={signModalOpen} onClose={() => setSignModalOpen(false)} mode={signModalMode} />
    </>
  );
}
