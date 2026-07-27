import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { submitRevokeAction } from "@/server/actions/revoke";

export default async function RevokePage() {
  const { userId } = await auth();
  if (!userId) redirect("/");

  return (
    <main className="mx-auto w-full max-w-xl px-6 py-12">
      {/*
        This form runs the full account cascade in src/server/signers/delete.ts
        — not just a signature delete. The list below has to name everything
        that cascade destroys, or people are consenting to something this page
        never described. If you widen the cascade, widen this list in the same
        commit.
      */}
      <h1 className="text-3xl font-semibold tracking-tight text-red-700">
        Delete your account
      </h1>
      <p className="mt-6 text-zinc-700">
        This will permanently:
      </p>
      <ul className="mt-3 list-disc pl-6 text-zinc-700">
        <li>Delete your signature from every version of the AI Bill of Rights you signed.</li>
        <li>Delete your name, location, and affiliation from the public signers list.</li>
        <li>Delete the consent records and any private fingerprint fields we captured.</li>
        <li>Delete any photo you uploaded, including all backup copies.</li>
        <li>Delete every comment you have written, and your &ldquo;why I signed&rdquo; statement.</li>
        <li>Delete every edit you have proposed, and every vote, upvote and endorsement you have cast.</li>
        <li>
          <strong className="font-semibold">
            Delete other people&apos;s comments on your proposals.
          </strong>{" "}
          A proposed edit cannot outlive its proposer, so the discussion
          attached to it goes too. Replies other people wrote to your comments
          are kept, and become top-level comments.
        </li>
        <li>Free up your email/phone so you can sign again later if you want.</li>
      </ul>
      <p className="mt-6 text-sm text-zinc-600">
        None of this can be undone. Are you sure?
      </p>
      <form action={submitRevokeAction} className="mt-8 flex gap-3">
        <button
          type="submit"
          className="rounded-full bg-red-700 px-6 py-3 text-base font-medium text-white hover:bg-red-600"
        >
          Yes, delete my account
        </button>
        <a
          href="/account"
          className="rounded-full px-6 py-3 text-base font-medium text-zinc-700 hover:bg-zinc-100"
        >
          Cancel
        </a>
      </form>
    </main>
  );
}
