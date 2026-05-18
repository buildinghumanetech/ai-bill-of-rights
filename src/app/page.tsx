import Link from "next/link";
import { getCurrentVersion, getSignatureCount } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default async function Home() {
  const current = await getCurrentVersion();
  const count = await getSignatureCount();
  const versionString = current?.version ?? "1.0.0";

  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-white px-6 py-24 dark:bg-black">
      <div className="max-w-3xl text-center">
        <p className="text-xs font-medium uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
          A People's Demand for Human-Centered AI
        </p>
        <h1 className="mt-4 text-5xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50 sm:text-6xl">
          The AI Bill of Rights
        </h1>
        <p className="mt-6 text-lg leading-8 text-zinc-700 dark:text-zinc-300">
          A versioned, signable document. Written so a 12-year-old in Nairobi, a
          70-year-old in rural Ohio, and a nurse in Jakarta can all recognize
          themselves in it.
        </p>
        <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
          <strong className="text-zinc-900 dark:text-zinc-100">
            {count.toLocaleString()}
          </strong>{" "}
          people have signed v{versionString}.
        </p>
        <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <Link
            href={`/v/${versionString}`}
            className="rounded-full bg-zinc-900 px-8 py-3 text-base font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
          >
            Read & sign →
          </Link>
          <Link
            href="/why"
            className="text-base font-medium text-zinc-700 underline-offset-4 hover:underline dark:text-zinc-300"
          >
            Why this matters
          </Link>
          <Link
            href={`/v/${versionString}/as-code`}
            className="text-base font-medium text-zinc-700 underline-offset-4 hover:underline dark:text-zinc-300"
          >
            Building AI? Implement this in your code →
          </Link>
        </div>
      </div>
    </main>
  );
}
