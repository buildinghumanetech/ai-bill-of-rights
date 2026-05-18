import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { submitRevokeAction } from "@/server/actions/revoke";

export default async function RevokePage() {
  const { userId } = await auth();
  if (!userId) redirect("/");

  return (
    <main className="mx-auto w-full max-w-xl px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight text-red-700 dark:text-red-400">
        Revoke your data
      </h1>
      <p className="mt-6 text-zinc-700 dark:text-zinc-300">
        Revoking will:
      </p>
      <ul className="mt-3 list-disc pl-6 text-zinc-700 dark:text-zinc-300">
        <li>Replace your public display name with &quot;Anonymized signer #N&quot;.</li>
        <li>Clear your public location and affiliation.</li>
        <li>Delete the IP, browser, and other private fields we captured.</li>
        <li>Leave your signature itself attached to the version you signed.</li>
      </ul>
      <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
        This is irreversible. Are you sure?
      </p>
      <form action={submitRevokeAction} className="mt-8 flex gap-3">
        <button
          type="submit"
          className="rounded-full bg-red-700 px-6 py-3 text-base font-medium text-white hover:bg-red-600"
        >
          Yes, revoke my data
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
