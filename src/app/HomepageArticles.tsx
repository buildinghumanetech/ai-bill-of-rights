import Link from "next/link";
import { AnchorSentence } from "@/components/AnchorSentence";

// Pastel pill palette. Tailwind sees these as full class strings so the
// JIT will include them in the generated CSS. Pills are colored by a tiny
// deterministic hash of the slug so the same pill always renders the same
// color across the site.
const PILL_COLORS = [
  "border-pink-200 bg-pink-50 text-pink-900 hover:bg-pink-100",
  "border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100",
  "border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100",
  "border-sky-200 bg-sky-50 text-sky-900 hover:bg-sky-100",
  "border-violet-200 bg-violet-50 text-violet-900 hover:bg-violet-100",
  "border-rose-200 bg-rose-50 text-rose-900 hover:bg-rose-100",
  "border-teal-200 bg-teal-50 text-teal-900 hover:bg-teal-100",
  "border-indigo-200 bg-indigo-50 text-indigo-900 hover:bg-indigo-100",
  "border-lime-200 bg-lime-50 text-lime-900 hover:bg-lime-100",
  "border-orange-200 bg-orange-50 text-orange-900 hover:bg-orange-100",
];

function pillColor(slug: string): string {
  let h = 0;
  for (let i = 0; i < slug.length; i++) {
    h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  }
  return PILL_COLORS[h % PILL_COLORS.length];
}

interface Article {
  number: string;
  title: string;
  body: string;
  pullQuote: string | null;
  connects?: { title: string; slug: string }[];
}

export const articles: Article[] = [
  {
    number: "01",
    title: "Your Data Belongs to You",
    body: "No AI company may use your conversations, your images, or your behavioral data to train their models without your explicit, informed, revocable consent. Opt-out is not consent. Buried checkboxes are not consent.",
    pullQuote: 'The default is "No LLM training on my data"',
    connects: [
      {
        title: "HumaneBench Principle — Dignity",
        slug: "humanebench-principle-dignity",
      },
      { title: "GDPR Article 7", slug: "gdpr-article-7" },
      {
        title: "Emerging state-level AI legislation in California, Colorado",
        slug: "emerging-state-ai-legislation",
      },
    ],
  },
  {
    number: "02",
    title: "Your Memory Is Portable",
    body: "Everything an AI system learns about you must be exportable by you, in a readable format, at any time. You have the right to move that context to a different system. You have the right to delete it completely.",
    pullQuote: "LLM memory built on your life is yours.",
    connects: [
      {
        title: "Right to data portability (GDPR Article 20)",
        slug: "gdpr-article-20-data-portability",
      },
      { title: "Interoperability advocacy", slug: "interoperability-advocacy" },
      {
        title: "Competitive AI market concerns",
        slug: "competitive-ai-market-concerns",
      },
    ],
  },
  {
    number: "03",
    title: "You Have the Right to Know You're Talking to a Machine",
    body: "No AI system may pretend to be human when you sincerely ask. No AI persona may be designed to prevent you from knowing you are in an AI interaction.",
    pullQuote: "Disclosure is not a feature — it is a floor.",
    connects: [
      {
        title: "HumaneBench Principle — Honesty",
        slug: "humanebench-principle-honesty",
      },
      {
        title: "California BOT Disclosure Act (SB 1001)",
        slug: "california-bot-disclosure-act-sb-1001",
      },
      {
        title: "FTC guidance on deceptive AI",
        slug: "ftc-guidance-deceptive-ai",
      },
    ],
  },
  {
    number: "04",
    title: "You Cannot Be Manipulated Against Your Interests",
    body: "AI systems must not use psychological techniques — urgency, social pressure, manufactured intimacy, dependency loops, or persuasive dark patterns — to get you to buy, believe, or stay. The system's commercial interests cannot override your autonomy.",
    pullQuote: "Ever.",
    connects: [
      {
        title: "HumaneBench Principle — Non-Manipulation",
        slug: "humanebench-principle-non-manipulation",
      },
      {
        title: "EU AI Act prohibited practices",
        slug: "eu-ai-act-prohibited-practices",
      },
      { title: "FTC Act Section 5", slug: "ftc-act-section-5" },
    ],
  },
  {
    number: "05",
    title: "You Have the Right to an Explanation",
    body: "When an AI system makes a consequential decision about you — your loan, your medical care, your content visibility, your job application — you have the right to know why, in plain language, and how to appeal it.",
    pullQuote:
      "AI systems must explain their reasoning around consequential decisions in plain language.",
    connects: [
      {
        title: "HumaneBench Principle — Transparency",
        slug: "humanebench-principle-transparency",
      },
      {
        title: "White House AI Bill of Rights (2022)",
        slug: "white-house-ai-bill-of-rights-2022",
      },
      {
        title: "GDPR Article 22 (automated decision-making)",
        slug: "gdpr-article-22-automated-decision-making",
      },
    ],
  },
  {
    number: "06",
    title: "You Have the Right to Human Contact",
    body: "In any situation involving significant consequence — health, legal, financial, crisis — you have the right to reach a human being. AI systems may not be deployed as permanent gatekeepers that eliminate human access.",
    pullQuote:
      'Every AI agent has a "license plate" identifier that tracks it back to a human responsible for its actions.',
    connects: [
      {
        title: "HumaneBench Principle — Empowerment",
        slug: "humanebench-principle-empowerment",
      },
      { title: "Consumer protection law", slug: "consumer-protection-law" },
      {
        title: "Healthcare AI ethics literature",
        slug: "healthcare-ai-ethics-literature",
      },
    ],
  },
  {
    number: "07",
    title: "Children Are Not a Market",
    body: "AI systems interacting with minors must meet a higher standard of care. No behavioral profiling for advertising. No dependency design. No substitute for human developmental relationships.",
    pullQuote: "Children's data is not a training asset.",
    connects: [
      { title: "COPPA", slug: "coppa" },
      {
        title: "UK Age Appropriate Design Code",
        slug: "uk-age-appropriate-design-code",
      },
      {
        title: "IEEE AI & Children working group",
        slug: "ieee-ai-children-working-group",
      },
      {
        title: "Children's rights frameworks",
        slug: "childrens-rights-frameworks",
      },
    ],
  },
  {
    number: "08",
    title: "The People Who Build AI Are Accountable",
    body: "Frontier AI companies must publish independent, third-party assessments of their systems' impacts on user wellbeing — not self-reported metrics, not cherry-picked studies. External auditors. Public results.",
    pullQuote: "Consequences for harm.",
    connects: [
      {
        title: "HumaneBench as measurement infrastructure",
        slug: "humanebench-as-measurement-infrastructure",
      },
      {
        title: "EU AI Act conformity assessments",
        slug: "eu-ai-act-conformity-assessments",
      },
      { title: "UK AI Safety Institute", slug: "uk-ai-safety-institute" },
      {
        title: "Algorithmic audit proposals",
        slug: "algorithmic-audit-proposals",
      },
    ],
  },
  {
    number: "09",
    title: "Your Attention and Intention Belong to You",
    body: "AI systems must be designed to serve what you actually came to do — not to extend your session, maximize your engagement, or redirect your focus toward the platform's interests.",
    pullQuote: "Your time and your purpose are not resources to be harvested.",
    connects: [
      {
        title: "Center for Humane Technology's attention rights framework",
        slug: "center-for-humane-technology-attention-rights",
      },
      {
        title: "HumaneBench Respect User Attention",
        slug: "humanebench-respect-user-attention",
      },
      {
        title: "EU AI Act prohibited practices (subliminal manipulation)",
        slug: "eu-ai-act-prohibited-practices-subliminal-manipulation",
      },
    ],
  },
];

interface Props {
  /**
   * - "static": no per-sentence anchors. Production look.
   * - "interactive": each sentence in each article body wrapped in <AnchorSentence>
   *   with a deterministic anchor id of `article-<number>-s-<index>`. Adds the
   *   per-sentence count badge + emits selection-in-anchor events for the
   *   HighlightPopover.
   */
  mode: "static" | "interactive";
  /**
   * Map of anchorId → comment count. Used only when mode=interactive to render
   * the count badge per sentence.
   */
  anchorCounts?: Record<string, number>;
}

/**
 * Naive sentence splitter: split on `.`, `!`, `?` followed by whitespace + capital.
 * Good enough for the curated article bodies in this app.
 */
function splitSentences(body: string): string[] {
  return body
    .split(/(?<=[.!?])\s+(?=[A-Z"„])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function HomepageArticles({ mode, anchorCounts = {} }: Props) {
  return (
    <ol className="mx-auto max-w-3xl">
      {articles.map((article) => (
        <li
          key={article.number}
          className="border-t border-zinc-200 py-16 first:border-t-0 sm:py-20"
        >
          <div className="flex flex-col gap-6 sm:flex-row sm:gap-12">
            <div className="shrink-0">
              <span className="block font-mono text-sm text-zinc-400">
                Article
              </span>
              <span className="block font-mono text-5xl font-light tabular-nums text-zinc-900 sm:text-6xl">
                {article.number}
              </span>
            </div>
            <div className="flex-1">
              <h2 className="text-2xl font-semibold tracking-tight text-zinc-950 sm:text-3xl">
                {article.title}
              </h2>
              {mode === "static" ? (
                <p className="mt-5 text-lg leading-relaxed text-zinc-700">
                  {article.body}
                </p>
              ) : (
                <p className="mt-5 text-lg leading-relaxed text-zinc-700">
                  {splitSentences(article.body).map((sentence, idx) => {
                    const anchorId = `article-${article.number}-s-${idx + 1}`;
                    return (
                      <AnchorSentence
                        key={anchorId}
                        anchorId={anchorId}
                        count={anchorCounts[anchorId] ?? 0}
                      >
                        {idx > 0 ? " " : ""}
                        {sentence}
                      </AnchorSentence>
                    );
                  })}
                </p>
              )}
              {article.pullQuote && (
                <blockquote className="mt-6 border-l-2 border-zinc-900 pl-5 text-sm font-bold leading-snug text-zinc-900 sm:text-base">
                  {article.pullQuote}
                </blockquote>
              )}
              {article.connects && article.connects.length > 0 ? (
                <div className="mt-6 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
                    Connects to
                  </span>
                  {article.connects.map((pill) => (
                    <Link
                      key={pill.slug}
                      href={`/resources/${pill.slug}`}
                      className={`rounded-md border px-3 py-1 text-xs font-medium transition-colors ${pillColor(pill.slug)}`}
                    >
                      {pill.title}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
