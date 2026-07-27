import Link from "next/link";
import { articles, splitSentences } from "@/app/HomepageArticles";

/**
 * A condensed, read-only rendering of the nine commitments.
 *
 * The signer page is a landing page for people who have never heard of this
 * project, so they need to see what they'd be signing without navigating away.
 * The full document lives on the homepage (`<HomepageArticles>`); this is the
 * one-line-per-article version, built from the same `articles` source so the
 * two can't drift. No data fetching — the signer page is `force-dynamic` and
 * this must not add a round-trip to it.
 */

/**
 * First sentence of an article body — enough to convey the commitment.
 *
 * Delegates to `splitSentences` rather than looking for the first `". "`:
 * that naive form cuts an article body containing "e.g. ", "U.S." or "vs."
 * mid-clause, and misses a first sentence that ends in `?` or `!` (returning
 * the whole paragraph instead of a one-liner).
 *
 * A body with no recognisable sentence break comes back from `splitSentences`
 * as a single element, so it is returned whole (trimmed). The only body that
 * splits to `[]` is a blank one — `splitSentences` ends in `.filter(Boolean)`
 * — so `""` is the whole of the empty case, not a stand-in for the body.
 */
export function gist(body: string): string {
  return splitSentences(body)[0] ?? "";
}

interface Props {
  /** Heading rendered above the list. */
  heading?: string;
  className?: string;
}

export function CommitmentsSummary({
  heading = "What they signed",
  className = "",
}: Props) {
  return (
    <section className={className}>
      <h2 className="text-xs font-medium uppercase tracking-[0.25em] text-zinc-500">
        {heading}
      </h2>
      <p className="mt-3 text-lg leading-snug text-zinc-900 sm:text-xl">
        The AI Bill of Rights is nine commitments we&apos;re demanding from
        every AI company.
      </p>
      <ol className="mt-6 flex flex-col gap-4">
        {articles.map((article) => (
          <li key={article.number} className="flex gap-4">
            <span
              aria-hidden
              className="mt-0.5 shrink-0 font-mono text-xs text-zinc-400"
            >
              {article.number}
            </span>
            <div>
              <h3 className="text-sm font-semibold tracking-tight text-zinc-950">
                {article.title}
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-zinc-600">
                {gist(article.body)}
              </p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-6 text-sm">
        <Link
          href="/"
          className="font-medium text-blue-700 underline-offset-4 hover:underline"
        >
          Read the full document
        </Link>
      </p>
    </section>
  );
}
