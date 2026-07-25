import Link from "next/link";

import { commentCountLabel } from "@/lib/comments/count";

interface Props {
  active: "current" | "proposed";
  currentVersion: string;
  proposedVersion: string;
  /**
   * Total comments on the proposed draft. Rendered as a sub-label on the
   * Proposed tab so the tab reads as an open conversation, not a second
   * static document.
   */
  commentCount?: number;
  /**
   * When provided, tabs render as buttons that call this callback (used by
   * `<TabbedDocument>` for instant client-side switching). Without it, tabs
   * render as `<Link>`s for plain SSR navigation.
   */
  onTabChange?: (tab: "current" | "proposed") => void;
}

interface FolderTabProps {
  isActive: boolean;
  label: string;
  subLabel?: string;
  href?: string;
  onClick?: () => void;
}

function FolderTab({ isActive, label, subLabel, href, onClick }: FolderTabProps) {
  // File-folder styling: rounded top corners, no rounded bottom; active tab
  // uses the doc body color (white) and drops its bottom border, then overlaps
  // the horizontal divider via -mb-px so it looks "attached" to the doc below.
  // Active tab is taller (py-3) than inactive (py-2); the nav uses items-end
  // so inactive tabs bottom-align and sit lower, making the active tab rise
  // above them like a raised folder tab.
  const base =
    "relative block rounded-t-lg border px-4 text-center font-mono text-sm font-semibold transition-colors sm:px-10";
  const active =
    "z-10 -mb-px border-b-0 border-zinc-300 bg-white py-3 text-zinc-900";
  const inactive =
    "border-zinc-200 bg-zinc-100 py-2 text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700";
  const cls = `${base} ${isActive ? active : inactive}`;

  const content = (
    <>
      {label}
      {subLabel ? (
        <span className="mt-0.5 block font-sans text-[11px] font-medium normal-case tracking-normal text-blue-700">
          {subLabel}
        </span>
      ) : null}
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cls}>
        {content}
      </button>
    );
  }
  return (
    <Link href={href ?? "/"} className={cls}>
      {content}
    </Link>
  );
}

export function TabBar({
  active,
  currentVersion,
  proposedVersion,
  commentCount,
  onTabChange,
}: Props) {
  // The Proposed tab is the only place feedback can be left, so it always
  // advertises what it is — a count once there's a conversation, an invitation
  // before that.
  const proposedSubLabel =
    commentCount === undefined
      ? undefined
      : commentCount > 0
        ? `${commentCountLabel(commentCount)} — add yours`
        : "Comment on this draft";

  return (
    <div>
      <nav className="flex items-end gap-1 px-4">
        <FolderTab
          isActive={active === "current"}
          label={`v${currentVersion}: Current`}
          subLabel={commentCount === undefined ? undefined : "Sign this version"}
          href={onTabChange ? undefined : "/"}
          onClick={onTabChange ? () => onTabChange("current") : undefined}
        />
        <FolderTab
          isActive={active === "proposed"}
          label={`v${proposedVersion}: Proposed`}
          subLabel={proposedSubLabel}
          href={onTabChange ? undefined : "/proposed"}
          onClick={onTabChange ? () => onTabChange("proposed") : undefined}
        />
      </nav>
      <div className="h-px bg-zinc-300" />
    </div>
  );
}
