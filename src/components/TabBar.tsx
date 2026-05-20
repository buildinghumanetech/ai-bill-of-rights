import Link from "next/link";

interface Props {
  active: "current" | "proposed";
  currentVersion: string;
  proposedVersion: string;
}

export function TabBar({ active, currentVersion, proposedVersion }: Props) {
  return (
    <nav className="mx-auto mt-2 mb-8 flex max-w-3xl gap-2 px-6">
      <Link
        href="/"
        className={`flex-1 rounded-lg border px-4 py-3 text-center text-sm font-semibold transition-colors ${
          active === "current"
            ? "border-zinc-900 bg-zinc-900 text-white"
            : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"
        }`}
      >
        v{currentVersion} · Current
      </Link>
      <Link
        href="/proposed"
        className={`flex-1 rounded-lg border px-4 py-3 text-center text-sm font-semibold transition-colors ${
          active === "proposed"
            ? "border-zinc-900 bg-zinc-900 text-white"
            : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"
        }`}
      >
        v{proposedVersion} · Proposed
      </Link>
    </nav>
  );
}
