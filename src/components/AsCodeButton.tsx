import Link from "next/link";

interface Props {
  version: string;
}

export function AsCodeButton({ version }: Props) {
  return (
    <Link
      href={`/v/${version}/as-code`}
      className="inline-flex items-center justify-center rounded-full border border-zinc-300 px-6 py-3 text-base font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
    >
      Implement as code →
    </Link>
  );
}
