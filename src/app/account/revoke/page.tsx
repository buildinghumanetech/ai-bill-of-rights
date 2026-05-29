import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { submitRevokeAction } from "@/server/actions/revoke";

export default async function RevokePage() {
  const { userId } = await auth();
  if (!userId) redirect("/");

  return (
    <main className="mx-auto w-full max-w-xl px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight text-red-700">
        Remove your signature
      </h1>
      <p className="mt-6 text-zinc-700">
        This will permanently:
      </p>
      <ul className="mt-3 list-disc pl-6 text-zinc-700">
        <li>Delete your signature from every version of the AI Bill of Rights you signed.</li>
        <li>Delete your name, location, and affiliation from the public signers list.</li>
        <li>Delete the consent records and any private fingerprint fields we captured.</li>
        <li>Delete any photo you uploaded, including all backup copies.</li>
        <li>Free up your email/phone so you can sign again later if you want.</li>
      </ul>
      <p className="mt-6 text-sm text-zinc-600">
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
          className="rounded-full px-6 py-3 text-base font-medium text-zinc-700 hover:bg-zinc-100"
        >
          Cancel
        </a>
      </form>
    </main>
  );
}
