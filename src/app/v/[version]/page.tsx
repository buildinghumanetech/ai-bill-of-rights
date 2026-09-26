import Link from "next/link";
import { notFound } from "next/navigation";
import { getVersionByString } from "@/lib/db/queries";
import { DocumentRenderer } from "@/components/DocumentRenderer";
import { VersionBanner } from "@/components/VersionBanner";
import FloatingSignButton from "@/app/FloatingSignButton";
import { AsCodeButton } from "@/components/AsCodeButton";
import type { ParsedDocument } from "@/lib/markdown/parse";
import { changelogFor } from "@/lib/content/changelog";
import { getViewerSignature } from "@/lib/viewer/signature";
import { AddMyNameButton } from "./AddMyNameButton";

export const dynamic = "force-dynamic";

export default async function VersionPage({
  params,
}: {
  params: Promise<{ version: string }>;
}) {
  const { version } = await params;
  const row = await getVersionByString(version);
  if (!row) {
    notFound();
  }
  const parsed = row.parsedJson as unknown as ParsedDocument;
  const changelog = changelogFor(row.version);
  // Offered only to someone who signed an earlier version, and only here on
  // the version that is open for signing: the one on-site way to re-sign.
  const viewer = row.isCurrent ? await getViewerSignature() : null;
  const canAddName = viewer !== null && viewer.newVersion === row.version;

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12">
      <VersionBanner version={row.version} publishedAt={row.publishedAt} />
      {row.isCurrent ? null : (
        <p className="mt-4 text-xs text-zinc-500">
          Archive view &mdash;{" "}
          <Link
            href="/"
            className="underline underline-offset-4 hover:text-zinc-900"
          >
            go to the current Bill
          </Link>
          .
        </p>
      )}

      {changelog ? (
        <section
          id="what-changed"
          className="mt-6 scroll-mt-6 rounded-lg border border-zinc-200 px-4 py-3"
        >
          <h2 className="text-sm font-semibold text-zinc-900">
            What changed in v{row.version}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-zinc-700">
            {changelog}
          </p>
        </section>
      ) : null}

      <div className="mt-10">
        <DocumentRenderer document={parsed} readOnly />
      </div>

      <div className="mt-12 flex justify-center">
        <AsCodeButton version={row.version} />
      </div>

      <section className="mt-20 border-t border-zinc-200 pt-12 pb-48 text-center">
        {canAddName ? (
          <div className="mb-8">
            <AddMyNameButton version={row.version} />
          </div>
        ) : null}
        <p className="text-xs font-medium uppercase tracking-[0.25em] text-zinc-500">
          Version {row.version} &mdash; a living document
        </p>
      </section>

      <FloatingSignButton />
    </main>
  );
}
