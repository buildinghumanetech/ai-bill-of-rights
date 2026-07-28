import Link from "next/link";
import HeroSection from "./HeroSection";
import {
  LiveSignatureHeadline,
  LiveSignatureMomentumPanel,
} from "./SignatureCount";
import { TabbedDocument } from "@/components/TabbedDocument";
import type { MomentumSigner } from "@/components/SignatureMomentum";
import { loadHomepageTabData } from "@/lib/homepage/load-tab-data";
import { listSignatures } from "@/lib/db/queries";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site-metadata";

export const dynamic = "force-dynamic";

/**
 * A handful of the most recent signers, shown as proof-of-quality while the
 * raw count is still small (see `@/components/SignatureMomentum`). Best-effort:
 * a DB hiccup just drops the chips, it never breaks the homepage.
 */
async function loadSignerSample(): Promise<MomentumSigner[]> {
  try {
    const rows = await listSignatures(null, { limit: 6, offset: 0 });
    return rows.map((row) => ({
      displayName: row.displayName,
      affiliation: row.affiliation,
      locationText: row.locationText,
    }));
  } catch {
    return [];
  }
}

export default async function Home() {
  const [data, signerSample] = await Promise.all([
    loadHomepageTabData(),
    loadSignerSample(),
  ]);

  return (
    <div className="flex-1">
      <section className="bg-white px-6 pt-14 pb-10 text-center sm:pt-20 sm:pb-14">
        <p className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">
          {SITE_TAGLINE}
        </p>
        <h1 className="text-balance text-5xl font-semibold tracking-tight text-zinc-950 sm:text-7xl">
          {SITE_NAME}
        </h1>
        <p className="mx-auto mt-6 max-w-none text-pretty text-xl leading-8 text-zinc-700 sm:text-2xl">
          <strong className="font-semibold text-zinc-950 sm:whitespace-nowrap">
            Eleven commitments we&apos;re demanding from every AI company
          </strong>
          <br />
          <LiveSignatureHeadline />
        </p>
        <p className="mx-auto mt-5 max-w-2xl text-pretty text-base leading-relaxed text-zinc-600">
          It&apos;s a living document, not a petition to take or leave. Sign v
          {data.currentVersion}, or{" "}
          <Link
            href="/proposed"
            className="font-semibold text-blue-600 underline underline-offset-4 hover:text-blue-700"
          >
            mark up the v{data.proposedVersion} draft
          </Link>{" "}
          and tell us what you&apos;d change.
        </p>
      </section>

      <HeroSection />

      <section className="bg-white px-6 pb-32 pt-10 sm:pt-14">
        <LiveSignatureMomentumPanel sample={signerSample} />
        <p className="mx-auto mb-10 mt-6 max-w-5xl text-center text-base leading-relaxed text-zinc-600 sm:mb-14">
          <Link
            href="/about"
            className="text-zinc-700 underline underline-offset-4 hover:text-blue-600"
          >
            Who created this?
          </Link>
        </p>

        <TabbedDocument initialTab="current" {...data} />
      </section>

      <section className="border-t border-zinc-200 bg-zinc-50 px-6 pt-24 pb-40 text-center">
        <div className="mx-auto max-w-2xl">
          <p className="text-xs font-medium uppercase tracking-[0.25em] text-zinc-500">
            Version {data.currentVersion} — a living document
          </p>
          <p className="mt-6 text-pretty text-xl leading-relaxed text-zinc-900 sm:text-2xl">
            These eleven commitments aren&apos;t a wishlist. They&apos;re the
            baseline. Companies that won&apos;t agree to them are telling
            you who they are.
          </p>
          <p className="mx-auto mt-6 max-w-xl text-pretty text-base leading-relaxed text-zinc-600">
            Not the whole way there for you? That&apos;s what the v
            {data.proposedVersion} draft is for — highlight any line and tell us
            what you&apos;d change. You don&apos;t have to agree with every word
            to have a say in the next version.
          </p>
          <div className="mt-10 flex flex-col items-center gap-6">
            <Link
              href="/proposed"
              className="rounded-full bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
            >
              Suggest a change to v{data.proposedVersion} →
            </Link>
            <Link
              href={`/v/${data.currentVersion}/as-code`}
              className="text-sm text-zinc-600 underline underline-offset-8 hover:text-zinc-900"
            >
              Building AI? Implement this in your code →
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
