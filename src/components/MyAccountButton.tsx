import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { signers } from "@/lib/db/schema";

/**
 * Floating "My Account" pill in the top-right of every page when the
 * viewer is signed in via Clerk AND has an existing signer row in our
 * DB. Hidden for anonymous visitors and for authenticated Clerk users
 * who have not yet signed (no /account to show them).
 */
export async function MyAccountButton() {
  const { userId } = await auth();
  if (!userId) return null;
  try {
    const rows = await db
      .select({ id: signers.id })
      .from(signers)
      .where(eq(signers.clerkUserId, userId))
      .limit(1);
    if (rows.length === 0) return null;
  } catch {
    return null;
  }

  return (
    <Link
      href="/account"
      className="fixed right-4 top-4 z-40 inline-flex items-center gap-1.5 rounded-full bg-white/85 px-4 py-2 text-xs font-semibold text-zinc-800 shadow-md ring-1 ring-zinc-200 backdrop-blur-md backdrop-saturate-150 transition-colors hover:bg-white hover:text-zinc-950"
    >
      <svg
        className="h-3.5 w-3.5"
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden
      >
        <path
          d="M8 8a3 3 0 100-6 3 3 0 000 6zM2 14a6 6 0 1112 0H2z"
          fill="currentColor"
        />
      </svg>
      My Account
    </Link>
  );
}
