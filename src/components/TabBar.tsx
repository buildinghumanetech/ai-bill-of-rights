import Link from "next/link";

interface Props {
  active: "current" | "proposed";
  currentVersion: string;
  proposedVersion: string;
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
  href?: string;
  onClick?: () => void;
}

function FolderTab({ isActive, label, href, onClick }: FolderTabProps) {
  // File-folder styling: rounded top corners, no rounded bottom; active tab
  // uses the doc body color (white) and drops its bottom border, then overlaps
  // the horizontal divider via -mb-px so it looks "attached" to the doc below.
  const base =
    "relative rounded-t-lg border px-5 py-2.5 text-sm font-semibold transition-colors";
  const active =
    "z-10 -mb-px border-b-0 border-zinc-300 bg-white text-zinc-900";
  const inactive =
    "border-zinc-200 bg-zinc-100 text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700";
  const cls = `${base} ${isActive ? active : inactive}`;

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cls}>
        {label}
      </button>
    );
  }
  return (
    <Link href={href ?? "/"} className={cls}>
      {label}
    </Link>
  );
}

export function TabBar({ active, currentVersion, proposedVersion, onTabChange }: Props) {
  return (
    <div>
      <nav className="flex items-end gap-1 px-4">
        <FolderTab
          isActive={active === "current"}
          label={`v${currentVersion} · Current`}
          href={onTabChange ? undefined : "/"}
          onClick={onTabChange ? () => onTabChange("current") : undefined}
        />
        <FolderTab
          isActive={active === "proposed"}
          label={`v${proposedVersion} · Proposed`}
          href={onTabChange ? undefined : "/proposed"}
          onClick={onTabChange ? () => onTabChange("proposed") : undefined}
        />
      </nav>
      <div className="h-px bg-zinc-300" />
    </div>
  );
}
