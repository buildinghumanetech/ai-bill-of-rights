import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  assessedCount,
  getScorecardEntry,
  isAssessed,
  listPrinciples,
  listScorecardSlugs,
  STATUS_LABELS,
  type ScorecardAssessment,
} from "@/lib/scorecard";
import { withShareParams } from "@/lib/share/urls";
import { FictionalBanner, Methodology } from "../Methodology";
import { StatusPill } from "../StatusPill";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://ai-for-people.org";

export function generateStaticParams() {
  return listScorecardSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const entry = getScorecardEntry(slug);
  if (!entry) return { title: "Scorecard entry not found" };

  const n = assessedCount(entry);
  const total = entry.assessments.length;
  const title = `${entry.company} — AI Bill of Rights Scorecard`;
  const description = entry.fictional
    ? `${entry.company} is a fictional example used to demonstrate the scorecard format.`
    : `${n} of ${total} commitments assessed, each traced to a public source. Last reviewed ${entry.lastReviewed}.`;
  const url = `${SITE_URL}/scorecard/${entry.slug}`;
  const image = `${SITE_URL}/api/og/scorecard/${entry.slug}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    // Unlisted until the project owner decides to publish.
    robots: { index: false, follow: false },
    openGraph: {
      type: "article",
      title,
      description,
      url,
      images: [{ url: image, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

function AssessmentSection({ a }: { a: ScorecardAssessment }) {
  const { principle } = a;
  return (
    <section
      id={principle.id}
      data-status={a.status}
      aria-labelledby={`${principle.id}-heading`}
      className="border-t border-zinc-200 py-8 first:border-t-0"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3
          id={`${principle.id}-heading`}
          className="text-pretty text-lg font-semibold tracking-tight text-zinc-950"
        >
          <span className="text-zinc-400">Article {principle.number}.</span>{" "}
          {principle.title}
        </h3>
        <StatusPill status={a.status} />
      </div>

      {isAssessed(a) ? (
        <>
          {a.assessment
            .split(/\n{2,}/)
            .map((p) => p.trim())
            .filter(Boolean)
            .map((p, i) => (
              <p
                key={i}
                className="mt-4 text-base leading-relaxed text-zinc-800"
              >
                {p}
              </p>
            ))}

          <div className="mt-5 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              {a.citations.length === 1 ? "Source" : "Sources"}
            </h4>
            <ul className="mt-3 space-y-3">
              {a.citations.map((c) => (
                <li key={c.url} className="text-sm">
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="font-medium text-emerald-700 underline underline-offset-4 hover:text-emerald-900"
                  >
                    {c.title}
                  </a>
                  <span className="ml-2 whitespace-nowrap text-xs text-zinc-500">
                    checked {c.checkedOn}
                  </span>
                  <span className="mt-0.5 block break-all font-mono text-[11px] text-zinc-400">
                    {c.url}
                  </span>
                  {c.quote ? (
                    <blockquote className="mt-2 border-l-2 border-zinc-300 pl-3 text-sm italic leading-relaxed text-zinc-600">
                      {c.quote}
                    </blockquote>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : (
        <p className="mt-4 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
          <strong className="font-semibold text-zinc-700">
            {STATUS_LABELS[a.status]}.
          </strong>{" "}
          Nobody has reviewed this commitment for this company yet. This is not
          a pass and not a failure — no claim is being made either way.
        </p>
      )}
    </section>
  );
}

export default async function ScorecardCompanyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const entry = getScorecardEntry(slug);
  if (!entry) notFound();

  const total = listPrinciples().length;
  const assessed = assessedCount(entry);
  const shareUrl = `${SITE_URL}/scorecard/${entry.slug}`;
  const shareText = `${entry.company} against the nine commitments in the AI Bill of Rights`;

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16 sm:py-24">
      <Link
        href="/scorecard"
        className="text-xs font-medium uppercase tracking-[0.25em] text-zinc-500 hover:text-zinc-900"
      >
        ← The Scorecard
      </Link>

      <header className="mt-6 border-b border-zinc-200 pb-8">
        <h1 className="text-pretty text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
          {entry.company}
        </h1>
        {entry.oneLiner ? (
          <p className="mt-3 text-lg leading-relaxed text-zinc-700">
            {entry.oneLiner}
          </p>
        ) : null}

        <FictionalBanner entry={entry} />

        <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-3 text-sm text-zinc-600">
          <div>
            <dt className="text-xs uppercase tracking-wider text-zinc-400">
              Assessed
            </dt>
            <dd className="mt-0.5 font-medium text-zinc-900">
              {assessed} of {total} commitments
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-zinc-400">
              Last reviewed
            </dt>
            <dd className="mt-0.5 font-medium text-zinc-900">
              {entry.lastReviewed}
            </dd>
          </div>
          {entry.reviewedBy ? (
            <div>
              <dt className="text-xs uppercase tracking-wider text-zinc-400">
                Reviewed by
              </dt>
              <dd className="mt-0.5 font-medium text-zinc-900">
                {entry.reviewedBy}
              </dd>
            </div>
          ) : null}
          {entry.homepageUrl ? (
            <div>
              <dt className="text-xs uppercase tracking-wider text-zinc-400">
                Company site
              </dt>
              <dd className="mt-0.5">
                <a
                  href={entry.homepageUrl}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="font-medium text-emerald-700 underline underline-offset-4 hover:text-emerald-900"
                >
                  {entry.homepageUrl.replace(/^https?:\/\//, "")}
                </a>
              </dd>
            </div>
          ) : null}
        </dl>

        {assessed < total ? (
          <p className="mt-6 text-sm leading-relaxed text-zinc-500">
            {total - assessed} of the {total}{" "}
            commitments below have not been assessed. They are shown as
            &ldquo;not yet assessed&rdquo; rather
            than hidden, so the gaps in this page are as visible as its claims.
          </p>
        ) : null}
      </header>

      <div className="mt-4">
        {entry.assessments.map((a) => (
          <AssessmentSection key={a.principle.id} a={a} />
        ))}
      </div>

      {entry.notes ? (
        <section
          aria-labelledby="entry-notes-heading"
          className="mt-4 border-t border-zinc-200 pt-8"
        >
          <h2
            id="entry-notes-heading"
            className="text-lg font-semibold tracking-tight text-zinc-950"
          >
            Notes on this entry
          </h2>
          {entry.notes
            .split(/\n{2,}/)
            .map((p) => p.trim())
            .filter(Boolean)
            .map((p, i) => (
              <p
                key={i}
                className="mt-4 text-base leading-relaxed text-zinc-800"
              >
                {p}
              </p>
            ))}
        </section>
      ) : null}

      <Methodology
        lastReviewed={entry.lastReviewed}
        disputeEmail={entry.disputeEmail}
        subject={entry.company}
      />

      <section
        aria-labelledby="share-heading"
        className="mt-10 rounded-2xl border border-amber-200 bg-amber-50 p-6"
      >
        <h2
          id="share-heading"
          className="text-sm font-semibold uppercase tracking-wider text-amber-900"
        >
          Pass it on
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-amber-900/80">
          Every claim here links to its source. Share it with the sources
          attached.
        </p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm font-medium">
          <a
            className="rounded-full bg-white px-4 py-2 text-amber-900 ring-1 ring-amber-300 hover:bg-amber-100"
            href={`https://x.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(withShareParams(shareUrl, { channel: "x" }))}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Share on X
          </a>
          <a
            className="rounded-full bg-white px-4 py-2 text-amber-900 ring-1 ring-amber-300 hover:bg-amber-100"
            href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(withShareParams(shareUrl, { channel: "linkedin" }))}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Share on LinkedIn
          </a>
          <a
            className="rounded-full bg-white px-4 py-2 text-amber-900 ring-1 ring-amber-300 hover:bg-amber-100"
            href={`mailto:?subject=${encodeURIComponent(shareText)}&body=${encodeURIComponent(withShareParams(shareUrl, { channel: "email" }))}`}
          >
            Share by email
          </a>
        </div>
      </section>
    </main>
  );
}
