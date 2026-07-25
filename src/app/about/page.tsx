import type { Metadata } from "next";
import Link from "next/link";
import ContactForm from "./ContactForm";

const ABOUT_TITLE = "About — AI Bill of Rights";
const ABOUT_DESCRIPTION =
  "The AI Bill of Rights is a project of the Building Humane Technology community, founded by Erika Anderson.";

export const metadata: Metadata = {
  title: ABOUT_TITLE,
  description: ABOUT_DESCRIPTION,
  // Next merges metadata shallowly, so without its own openGraph/twitter this
  // page would inherit the root's and share as if it were the homepage.
  openGraph: { title: ABOUT_TITLE, description: ABOUT_DESCRIPTION },
  twitter: { title: ABOUT_TITLE, description: ABOUT_DESCRIPTION },
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
        <div className="mt-2 flex items-center gap-3">
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-950 sm:text-3xl">
            Erika Anderson
          </h2>
          <a
            href="https://www.linkedin.com/in/erikamanderson"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Erika Anderson on LinkedIn"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-[#0a66c2] text-white transition-colors hover:bg-[#004182]"
          >
            <svg
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
              className="h-4 w-4"
            >
              <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.36V9h3.41v1.56h.05c.47-.9 1.64-1.85 3.38-1.85 3.62 0 4.29 2.38 4.29 5.48v6.26zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0z" />
            </svg>
          </a>
        </div>
        <p className="mt-4 text-base leading-relaxed text-zinc-700">
          Erika Anderson is the founder of Building Humane Technology and
          the originator of the AI Bill of Rights. She co-leads HumaneBench
          — the open-source measurement and observability infrastructure
          that turns the principles in this document into testable scores
          against real AI systems — and convenes the community that drafts,
          maintains, and advocates for the document you signed.
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
          <a
            href="https://humanetech.substack.com/p/an-ai-bill-of-rights-written-by-us"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-blue-600 underline underline-offset-4 hover:text-blue-800"
          >
            Read the story →
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

      <section className="mt-14">
        <h2 className="text-xl font-semibold tracking-tight text-zinc-950">
          Contact us
        </h2>
        <p className="mt-2 text-sm text-zinc-600">
          Questions, press, partnerships, or feedback? Send us a note and
          we&rsquo;ll get back to you.
        </p>
        <div className="mt-5">
          <ContactForm />
        </div>
      </section>

      <p className="mt-16 text-center text-xs text-zinc-500">
        AI Bill of Rights · A Building Humane Technology project
      </p>
    </main>
  );
}
