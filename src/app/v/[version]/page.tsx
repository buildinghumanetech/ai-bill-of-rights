import Link from "next/link";
import { notFound } from "next/navigation";
import { getVersionByString, getSignatureCount } from "@/lib/db/queries";
import { DocumentRenderer } from "@/components/DocumentRenderer";
import { VersionBanner } from "@/components/VersionBanner";
import FloatingSignButton from "@/app/FloatingSignButton";
import type { ParsedDocument } from "@/lib/markdown/parse";

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

  let signatureCount = 0;
  try {
    signatureCount = await getSignatureCount();
  } catch {
    signatureCount = 0;
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12">
      <VersionBanner version={row.version} publishedAt={row.publishedAt} />
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

      <div className="mt-10">
        <DocumentRenderer document={parsed} readOnly />
      </div>

      <section className="mt-20 border-t border-zinc-200 pt-12 pb-48 text-center">
        <p className="text-xs font-medium uppercase tracking-[0.25em] text-zinc-500">
          Version {row.version} &mdash; a living document
        </p>
      </section>

      <FloatingSignButton signatureCount={signatureCount} />
    </main>
  );
}
