import type { Metadata } from "next";
import Link from "next/link";
import {
  assessedCount,
  latestReviewDate,
  listPrinciples,
  loadAllScorecardEntries,
  STATUS_SHORT_LABELS,
} from "@/lib/scorecard";
import { SITE_NAME, buildPageMetadata, getSiteUrl } from "@/lib/site-metadata";
import { Methodology } from "./Methodology";
import { STATUS_CLASSES } from "./status-style";

// Already names the site in prose, so `buildPageMetadata` must not append it.
const TITLE = `${SITE_NAME} Scorecard`;
const DESCRIPTION =
  "Where AI companies stand against the eleven commitments in the AI Bill of Rights — every assessment traced to a public source, with the date it was checked.";

// Via getSiteUrl(), not a local `?? "https://ai-for-people.org"`: that copy of
// the fallback ignored VERCEL_URL, so preview deploys advertised production.
const SITE_URL = getSiteUrl();

export const metadata: Metadata = {
  ...buildPageMetadata({
    title: TITLE,
    description: DESCRIPTION,
    appendSiteName: false,
    url: `${SITE_URL}/scorecard`,
    imageUrl: `${SITE_URL}/api/og/scorecard`,
  }),
  alternates: { canonical: `${SITE_URL}/scorecard` },
  // Unlisted until the project owner decides to publish. Remove this block
  // (and add the nav link) when the scorecard goes public.
  robots: { index: false, follow: false },
};

export default function ScorecardIndexPage() {
  const principles = listPrinciples();
  const entries = loadAllScorecardEntries();
  const lastReviewed = latestReviewDate(entries);
  const realEntries = entries.filter((e) => !e.fictional);
  const totalAssessed = realEntries.reduce((n, e) => n + assessedCount(e), 0);

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-16 sm:py-24">
      <Link
        href="/"
        className="text-xs font-medium uppercase tracking-[0.25em] text-zinc-500 hover:text-zinc-900"
      >
        ← AI Bill of Rights
      </Link>

      <header className="mt-6 border-b border-zinc-200 pb-8">
        <h1 className="text-pretty text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
          {TITLE}
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-zinc-700">
          Eleven commitments. One row per company. Every assessment on this page
          links to the public source it came from and the date a human read it —
          and anything nobody has looked at yet says so.
        </p>
        <p className="mt-4 text-sm text-zinc-500">
          {realEntries.length === 0 ? (
            <>
              No companies have been assessed yet. The page below shows the
              format only.
            </>
          ) : (
            <>
              {realEntries.length}{" "}
              {realEntries.length === 1 ? "company" : "companies"} ·{" "}
              {totalAssessed} of {realEntries.length * principles.length}{" "}
              commitments assessed
              {lastReviewed ? <> · last reviewed {lastReviewed}</> : null}
            </>
          )}
        </p>
      </header>

      {entries.length === 0 ? (
        <p className="mt-10 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-8 text-sm text-zinc-600">
          There are no scorecard entries yet. Add one under{" "}
          <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs">
            content/scorecard/
          </code>{" "}
          — see the README in that directory.
        </p>
      ) : (
        <>
          <section aria-labelledby="matrix-heading" className="mt-10">
            <h2 id="matrix-heading" className="sr-only">
              Assessments by company and commitment
            </h2>
            <div className="overflow-x-auto rounded-2xl border border-zinc-200">
              <table className="w-full min-w-[46rem] border-collapse text-left">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50">
                    <th
                      scope="col"
                      className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-zinc-500"
                    >
                      Company
                    </th>
                    {principles.map((p) => (
                      <th
                        key={p.id}
                        scope="col"
                        title={p.headingText}
                        className="px-1 py-3 text-center text-xs font-semibold uppercase tracking-wider text-zinc-500"
                      >
                        <abbr
                          title={p.headingText}
                          className="no-underline"
                        >{`Art. ${p.number}`}</abbr>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr
                      key={entry.slug}
                      className="border-b border-zinc-100 last:border-b-0"
                    >
                      <th
                        scope="row"
                        className="px-4 py-3 align-middle text-sm font-semibold text-zinc-900"
                      >
                        <Link
                          href={`/scorecard/${entry.slug}`}
                          className="underline decoration-zinc-300 underline-offset-4 hover:decoration-zinc-900"
                        >
                          {entry.company}
                        </Link>
                        {entry.fictional ? (
                          <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900">
                            Example
                          </span>
                        ) : null}
                        <span className="mt-1 block text-xs font-normal text-zinc-500">
                          {assessedCount(entry)} of {principles.length}{" "}
                          assessed
                        </span>
                      </th>
                      {entry.assessments.map((a) => (
                        <td
                          key={a.principle.id}
                          className="px-1 py-3 text-center align-middle"
                        >
                          <span
                            data-status={a.status}
                            title={`${a.principle.headingText} — ${STATUS_SHORT_LABELS[a.status]}`}
                            className={`inline-flex min-w-[4.5rem] justify-center rounded-full border px-1.5 py-1 text-[10px] font-semibold ${STATUS_CLASSES[a.status]}`}
                          >
                            {STATUS_SHORT_LABELS[a.status]}
                          </span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section aria-labelledby="commitments-heading" className="mt-10">
            <h2
              id="commitments-heading"
              className="text-lg font-semibold tracking-tight text-zinc-950"
            >
              The eleven commitments
            </h2>
            <ol className="mt-4 grid gap-x-8 gap-y-2 sm:grid-cols-2">
              {principles.map((p) => (
                <li key={p.id} className="text-sm text-zinc-700">
                  <span className="font-semibold text-zinc-900">
                    Article {p.number}.
                  </span>{" "}
                  {p.title}
                </li>
              ))}
            </ol>
            <p className="mt-4 text-sm text-zinc-500">
              Read them in full in{" "}
              <Link
                href="/"
                className="text-emerald-700 underline underline-offset-4 hover:text-emerald-900"
              >
                the AI Bill of Rights
              </Link>
              .
            </p>
          </section>
        </>
      )}

      <Methodology lastReviewed={lastReviewed} />
    </main>
  );
}
