import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About — AI Bill of Rights",
  description:
    "The AI Bill of Rights is a project of the Building Humane Technology community, founded by Erika Anderson.",
};

export default function AboutPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12 pb-32 sm:py-16">
      <Link
        href="/"
        className="text-xs font-medium uppercase tracking-[0.25em] text-zinc-500 hover:text-zinc-900"
      >
        ← AI Bill of Rights
      </Link>

      <h1 className="mt-6 text-pretty text-4xl font-semibold tracking-tight text-zinc-950 sm:text-5xl">
        Who created this?
      </h1>
      <p className="mt-4 text-lg leading-relaxed text-zinc-700">
        The AI Bill of Rights is a project of the{" "}
        <a
          href="https://buildinghumanetech.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-zinc-950 underline underline-offset-4 hover:text-blue-600"
        >
          Building Humane Technology
        </a>{" "}
        community.
      </p>

      <section className="mt-10 overflow-hidden rounded-2xl bg-zinc-900 shadow-xl">
        <div className="aspect-video w-full">
          <iframe
            className="h-full w-full"
            src="https://www.youtube.com/embed/LgOE-uRs2IM"
            title="Building Humane Technology"
            frameBorder={0}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-2xl font-semibold tracking-tight text-zinc-950 sm:text-3xl">
          The driving force
        </h2>
        <p className="mt-4 text-base leading-relaxed text-zinc-700">
          Building Humane Technology is an open-source community of
          founders, engineers, designers, researchers, and policy-makers
          working to make humane tech development easy, scalable, and
          profitable. The AI Bill of Rights is one of several living
          documents the community maintains as a public commitment to
          human-centered AI.
        </p>
      </section>

      <section className="mt-12 rounded-2xl border border-zinc-200 bg-zinc-50 p-7">
        <p className="text-xs font-medium uppercase tracking-[0.25em] text-zinc-500">
          Founder
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950 sm:text-3xl">
          Erika Anderson
        </h2>
        <p className="mt-4 text-base leading-relaxed text-zinc-700">
          Erika Anderson is the founder of Building Humane Technology and
          the originator of the AI Bill of Rights. She co-leads HumaneBench
          — the measurement infrastructure that turns the principles in
          this document into testable scores against real AI systems — and
          convenes the community that drafts, maintains, and advocates for
          the document you signed.
        </p>
        <div className="mt-5 flex flex-wrap gap-4 text-sm">
          <a
            href="https://buildinghumanetech.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-blue-600 underline underline-offset-4 hover:text-blue-800"
          >
            buildinghumanetech.com
          </a>
          <a
            href="https://humanebench.ai/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-blue-600 underline underline-offset-4 hover:text-blue-800"
          >
            humanebench.ai
          </a>
        </div>
      </section>

      <section className="mt-14">
        <h2 className="text-xl font-semibold tracking-tight text-zinc-950">
          How to contribute
        </h2>
        <ul className="mt-4 flex flex-col gap-3 text-base leading-relaxed text-zinc-700">
          <li>
            <span className="font-semibold text-zinc-950">Sign it.</span>{" "}
            Your signature adds weight to the demand.{" "}
            <Link
              href="/"
              className="text-blue-600 underline underline-offset-4 hover:text-blue-800"
            >
              Read and sign →
            </Link>
          </li>
          <li>
            <span className="font-semibold text-zinc-950">Share it.</span>{" "}
            Every new signature makes AI companies pay more attention.
          </li>
          <li>
            <span className="font-semibold text-zinc-950">Edit it.</span>{" "}
            The document lives in version control on GitHub — propose
            edits, additions, or new translations via pull request.{" "}
            <a
              href="https://github.com/buildinghumanetech/ai-bill-of-rights"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 underline underline-offset-4 hover:text-blue-800"
            >
              github.com/buildinghumanetech/ai-bill-of-rights
            </a>
          </li>
        </ul>
      </section>

      <p className="mt-16 text-center text-xs text-zinc-500">
        AI Bill of Rights · A Building Humane Technology project
      </p>
    </main>
  );
}
