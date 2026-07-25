import {
  ALL_STATUSES,
  STATUS_LABELS,
  type ScorecardEntry,
} from "@/lib/scorecard";
import { STATUS_CLASSES, STATUS_DESCRIPTIONS } from "./status-style";

const DEFAULT_DISPUTE_EMAIL = "hello@ai-for-people.org";

/**
 * The scorecard has to show its work on the same page as its claims. This
 * block states what the assessments are, what they are not, where each one
 * comes from, when it was last looked at, and how to get one corrected.
 */
export function Methodology({
  lastReviewed,
  disputeEmail = DEFAULT_DISPUTE_EMAIL,
  subject,
}: {
  lastReviewed: string | null;
  disputeEmail?: string | null;
  /** Company name, when this appears on a single-company page. */
  subject?: string | null;
}) {
  const email = disputeEmail || DEFAULT_DISPUTE_EMAIL;
  return (
    <section
      id="methodology"
      aria-labelledby="methodology-heading"
      className="mt-12 rounded-2xl border border-zinc-200 bg-zinc-50 p-6 sm:p-8"
    >
      <h2
        id="methodology-heading"
        className="text-lg font-semibold tracking-tight text-zinc-950"
      >
        How to read this scorecard
      </h2>

      <dl className="mt-5 space-y-5 text-sm leading-relaxed text-zinc-700">
        <div>
          <dt className="font-semibold text-zinc-900">What this is</dt>
          <dd className="mt-1">
            A record of what{" "}
            {subject ? <strong>{subject}</strong> : "each company"} has said and
            done <em>in public</em>, read against the nine commitments in the AI
            Bill of Rights. Each row is a human reading published sources —
            policies, documentation, filings, product behaviour — and writing
            down what those sources show.
          </dd>
        </div>

        <div>
          <dt className="font-semibold text-zinc-900">What this is not</dt>
          <dd className="mt-1">
            Not an audit, not a certification, and not a claim about anything
            that is not publicly documented. We have no access to internal
            systems. A commitment marked{" "}
            <span className="font-medium">&ldquo;No clear public evidence&rdquo;</span>{" "}
            describes the state of the public record, not the state of the
            company.
          </dd>
        </div>

        <div>
          <dt className="font-semibold text-zinc-900">Every claim is cited</dt>
          <dd className="mt-1">
            No assessment can be published without at least one source link and
            the date a human opened it. This is enforced in the content
            pipeline, not by convention: an uncited assessment fails validation
            and never reaches this page. Follow the links and check us.
          </dd>
        </div>

        <div>
          <dt className="font-semibold text-zinc-900">
            Silence is not a verdict
          </dt>
          <dd className="mt-1">
            Most commitments for most companies are marked{" "}
            <span className="font-medium">&ldquo;Not yet assessed.&rdquo;</span>{" "}
            That means nobody has looked yet. It is not a pass, and it is not a
            failure. Do not read anything into it.
          </dd>
        </div>

        <div>
          <dt className="font-semibold text-zinc-900">When this was checked</dt>
          <dd className="mt-1">
            {lastReviewed ? (
              <>
                Last reviewed <strong>{lastReviewed}</strong>. Each individual
                source also carries the date it was last opened — companies
                change their policies, and an assessment is only as current as
                its citation.
              </>
            ) : (
              <>
                Nothing has been reviewed yet. Individual sources carry the date
                they were last opened.
              </>
            )}
          </dd>
        </div>

        <div>
          <dt className="font-semibold text-zinc-900">
            How to dispute an entry
          </dt>
          <dd className="mt-1">
            If you work at a company listed here and believe an assessment is
            wrong, out of date, or missing context, email{" "}
            <a
              className="font-medium text-emerald-700 underline underline-offset-4 hover:text-emerald-900"
              href={`mailto:${email}?subject=${encodeURIComponent(
                `Scorecard correction${subject ? `: ${subject}` : ""}`,
              )}`}
            >
              {email}
            </a>{" "}
            with the source that shows it. Corrections that come with a citation
            get applied. We will publish the change and the date it was made.
          </dd>
        </div>
      </dl>

      <h3 className="mt-8 text-sm font-semibold text-zinc-900">
        What each label means
      </h3>
      <ul className="mt-3 space-y-2">
        {ALL_STATUSES.map((status) => (
          <li key={status} className="flex flex-wrap items-baseline gap-2">
            <span
              className={`inline-flex shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_CLASSES[status]}`}
            >
              {STATUS_LABELS[status]}
            </span>
            <span className="text-sm text-zinc-600">
              {STATUS_DESCRIPTIONS[status]}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function FictionalBanner({ entry }: { entry: ScorecardEntry }) {
  if (!entry.fictional) return null;
  return (
    <p className="mt-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
      <strong>{entry.company} is not a real company.</strong> This entry is a
      format demonstration. Every source it links to is fabricated, and nothing
      on it describes any real organisation.
    </p>
  );
}

export { DEFAULT_DISPUTE_EMAIL };
