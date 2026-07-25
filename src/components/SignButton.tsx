import Link from "next/link";

interface Props {
  version: string;
}

export function SignButton({ version }: Props) {
  return (
    <Link
      href={`/sign/profile?version=${encodeURIComponent(version)}`}
      className="inline-flex items-center justify-center rounded-full bg-zinc-900 px-6 py-3 text-base font-medium text-white transition-colors hover:bg-zinc-700"
    >
      Sign this version (v{version})
    </Link>
  );
}
