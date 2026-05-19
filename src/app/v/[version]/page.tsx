import { notFound } from "next/navigation";
import { getVersionByString, listCommentsForAnchor, countCommentsByAnchor } from "@/lib/db/queries";
import { DocumentRenderer } from "@/components/DocumentRenderer";
import { VersionBanner } from "@/components/VersionBanner";
import { SignButton } from "@/components/SignButton";
import { AsCodeButton } from "@/components/AsCodeButton";
import { CommentDrawer } from "@/components/CommentDrawer";
import type { ParsedDocument } from "@/lib/markdown/parse";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { signers } from "@/lib/db/schema";
import { db } from "@/lib/db";

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
  const anchorCounts = await countCommentsByAnchor(undefined, row.id);
  const anchorIdsWithComments = Object.keys(anchorCounts);
  let allComments: any[] = [];
  for (const a of anchorIdsWithComments) {
    const rows = await listCommentsForAnchor(undefined, row.id, a);
    allComments = allComments.concat(rows);
  }
  const { userId } = await auth();
  let isSignedIn = false;
  if (userId) {
    const s = await db.select({ id: signers.id }).from(signers).where(eq(signers.clerkUserId, userId)).limit(1);
    isSignedIn = s.length > 0;
  }
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <VersionBanner version={row.version} publishedAt={row.publishedAt} />
      <div className="mt-8">
        <DocumentRenderer document={parsed} anchorCounts={anchorCounts} />
      </div>
      <div className="sticky bottom-6 mt-12 flex flex-wrap justify-center gap-3">
        <SignButton version={row.version} />
        <AsCodeButton version={row.version} />
      </div>
      <CommentDrawer
        versionId={row.id}
        versionString={row.version}
        initialComments={allComments}
        isSignedIn={isSignedIn}
      />
    </main>
  );
}
