import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { submitRevokeAction } from "@/server/actions/revoke";

export default async function RevokePage() {
  const { userId } = await auth();
  if (!userId) redirect("/");

  return (
    <main className="mx-auto w-full max-w-xl px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight text-red-700 dark:text-red-400">
        Remove your signature
      </h1>
      <p className="mt-6 text-zinc-700 dark:text-zinc-300">
        This permanently anonymizes your signature. We will:
      </p>
      <ul className="mt-3 list-disc pl-6 text-zinc-700 dark:text-zinc-300">
        <li>
          Replace your public entry with an anonymized label (&ldquo;Anonymized
          signer #N,&rdquo; where N is your signature number) &mdash; your signature
          still counts toward the total, but your name, location, and affiliation no
          longer appear.
        </li>
        <li>
          Erase the private fields we captured (IP, device, approximate location,
          contact details); we keep the consent record itself, minus those fields, as
          proof of what you agreed to.
        </li>
        <li>Delete any photo you uploaded.</li>
      </ul>
      <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
        This is irreversible. Are you sure?
      </p>
      <form action={submitRevokeAction} className="mt-8 flex gap-3">
        <button
          type="submit"
          className="rounded-full bg-red-700 px-6 py-3 text-base font-medium text-white hover:bg-red-600"
        >
          Yes, remove my signature
        </button>
        <a
          href="/account"
          className="rounded-full px-6 py-3 text-base font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Cancel
        </a>
      </form>
    </main>
  );
}
