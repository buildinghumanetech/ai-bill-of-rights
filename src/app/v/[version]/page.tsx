import { notFound } from "next/navigation";
import { getVersionByString } from "@/lib/db/queries";
import { DocumentRenderer } from "@/components/DocumentRenderer";
import { VersionBanner } from "@/components/VersionBanner";
import { SignButton } from "@/components/SignButton";
import { AsCodeButton } from "@/components/AsCodeButton";
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
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <VersionBanner version={row.version} publishedAt={row.publishedAt} />
      <div className="mt-8">
        <DocumentRenderer document={parsed} />
      </div>
      <div className="sticky bottom-6 mt-12 flex flex-wrap justify-center gap-3">
        <SignButton version={row.version} />
        <AsCodeButton version={row.version} />
      </div>
    </main>
  );
}
