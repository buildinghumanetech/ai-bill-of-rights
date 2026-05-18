import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { signers } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export default async function CompletePage({
  searchParams,
}: {
  searchParams: Promise<{ version?: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/");
  const { version = "1.0.0" } = await searchParams;
  const rows = await db
    .select()
    .from(signers)
    .where(eq(signers.clerkUserId, userId))
    .limit(1);
  const signer = rows[0];

  return (
    <main className="mx-auto w-full max-w-xl px-6 py-24 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">Signed.</h1>
      <p className="mt-4 text-lg text-zinc-700 dark:text-zinc-300">
        Thank you, {signer?.displayName ?? "friend"}. You signed v{version}.
      </p>
      <div className="mt-10 flex flex-col items-center gap-3">
        {signer ? (
          <Link
            href={`/signatories/${signer.id}`}
            className="rounded-full bg-zinc-900 px-6 py-3 text-sm font-medium text-white dark:bg-zinc-50 dark:text-zinc-950"
          >
            See your public page →
          </Link>
        ) : null}
        <Link
          href="/signatories"
          className="text-sm font-medium text-zinc-700 underline-offset-4 hover:underline dark:text-zinc-300"
        >
          See everyone who has signed
        </Link>
      </div>
    </main>
  );
}
