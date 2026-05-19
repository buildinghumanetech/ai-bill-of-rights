import Link from "next/link";
import HeroSection from "./HeroSection";
import FloatingSignButton from "./FloatingSignButton";
import { getSignatureCount } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

const articles = [
  {
    number: "01",
    title: "Your Data Belongs to You",
    body: "No AI company may use your conversations, your images, or your behavioral data to train their models without your explicit, informed, revocable consent. Opt-out is not consent. Buried checkboxes are not consent.",
    pullQuote: "The default is no.",
  },
  {
    number: "02",
    title: "Your Memory Is Portable",
    body: "Everything an AI system learns about you must be exportable by you, in a readable format, at any time. You have the right to move that context to a different system. You have the right to delete it completely.",
    pullQuote: "Memory built on your life is yours.",
  },
  {
    number: "03",
    title: "You Have the Right to Know You're Talking to a Machine",
    body: "No AI system may pretend to be human when you sincerely ask. No AI persona may be designed to prevent you from knowing you are in an AI interaction.",
    pullQuote: "Disclosure is not a feature — it is a floor.",
  },
  {
    number: "04",
    title: "You Cannot Be Manipulated Against Your Interests",
    body: "AI systems must not use psychological techniques — urgency, social pressure, manufactured intimacy, dependency loops, or persuasive dark patterns — to get you to buy, believe, or stay. The system's commercial interests cannot override your autonomy.",
    pullQuote: "Ever.",
  },
  {
    number: "05",
    title: "You Have the Right to an Explanation",
    body: "When an AI system makes a consequential decision about you — your loan, your medical care, your content visibility, your job application — you have the right to know why, in plain language, and how to appeal it.",
    pullQuote: null,
  },
  {
    number: "06",
    title: "You Have the Right to Human Contact",
    body: "In any situation involving significant consequence — health, legal, financial, crisis — you have the right to reach a human being. AI systems may not be deployed as permanent gatekeepers that eliminate human access.",
    pullQuote: "The loop stays open.",
  },
  {
    number: "07",
    title: "Children Are Not a Market",
    body: "AI systems interacting with minors must meet a higher standard of care. No behavioral profiling for advertising. No dependency design. No substitute for human developmental relationships.",
    pullQuote: "Children's data is not a training asset.",
  },
  {
    number: "08",
    title: "The People Who Build AI Are Accountable",
    body: "Frontier AI companies must publish independent, third-party assessments of their systems' impacts on user wellbeing — not self-reported metrics, not cherry-picked studies. External auditors. Public results.",
    pullQuote: "Consequences for harm.",
  },
  {
    number: "09",
    title: "Your Attention and Intention Belong to You",
    body: "AI systems must be designed to serve what you actually came to do — not to extend your session, maximize your engagement, or redirect your focus toward the platform's interests.",
    pullQuote: "Your time and your purpose are not resources to be harvested.",
  },
];

export default async function Home() {
  let signatureCount = 0;
  try {
    signatureCount = await getSignatureCount();
  } catch {
    // DB not reachable (e.g. preview without DATABASE_URL) — fall back to 0
    signatureCount = 0;
  }

  return (
    <div className="flex-1">
      <section className="bg-white px-6 pt-14 pb-10 text-center sm:pt-20 sm:pb-14">
        <h1 className="text-balance text-5xl font-semibold tracking-tight text-zinc-950 sm:text-7xl">
          The AI Bill of Rights
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg leading-8 text-zinc-700 sm:text-xl">
          <strong className="font-semibold text-zinc-950">
            Nine commitments we&apos;re demanding from every AI company
          </strong>
          <br />
          with{" "}
          <Link
            href="/signers"
            className="font-bold text-blue-600 hover:underline"
          >
            {signatureCount.toLocaleString()} signatures
          </Link>{" "}
          to back them up.
        </p>
      </section>

      <HeroSection />

      <section className="bg-white px-6 pb-32 pt-24 sm:pt-32">
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
                  <p className="mt-5 text-lg leading-relaxed text-zinc-700">
                    {article.body}
                  </p>
                  {article.pullQuote && (
                    <blockquote className="mt-6 border-l-2 border-zinc-900 pl-5 text-xl font-medium italic leading-snug text-zinc-900 sm:text-2xl">
                      {article.pullQuote}
                    </blockquote>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-t border-zinc-200 bg-zinc-50 px-6 py-24 text-center">
        <div className="mx-auto max-w-2xl">
          <p className="text-xs font-medium uppercase tracking-[0.25em] text-zinc-500">
            Version 1.0.0 — a living document
          </p>
          <p className="mt-6 text-pretty text-xl leading-relaxed text-zinc-900 sm:text-2xl">
            These nine commitments aren&apos;t a wishlist. They&apos;re the
            line. Companies that won&apos;t agree to them are telling you who
            they are.
          </p>
          <div className="mt-10 flex flex-col items-center gap-6">
            <Link
              href="/v/1.0.0/as-code"
              className="text-sm text-zinc-600 underline underline-offset-8 hover:text-zinc-900"
            >
              Building AI? Implement this in your code →
            </Link>
          </div>
        </div>
      </section>

      <FloatingSignButton signatureCount={signatureCount} />
    </div>
  );
}
