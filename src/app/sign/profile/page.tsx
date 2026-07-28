import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { submitProfileAction } from "@/server/actions/profile";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ version?: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/");
  const { version = "0.1.0" } = await searchParams;

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Sign — Step 1 of 2</h1>
      <p className="mt-2 text-sm text-zinc-600">
        These three fields are public. Everything else stays private — you'll
        see exactly what on the next screen.
      </p>
      <form action={submitProfileAction} className="mt-8 flex flex-col gap-6">
        <input type="hidden" name="version" value={version} />
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium">Display name (required)</span>
          <span className="text-xs text-zinc-500">
            The name you want history to remember.
          </span>
          <input
            name="displayName"
            type="text"
            required
            maxLength={200}
            className="rounded-md border border-zinc-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium">Location (optional)</span>
          <span className="text-xs text-zinc-500">
            Examples: "Seoul", "rural Ohio", "Nairobi". As specific or general
            as you want.
          </span>
          <input
            name="location"
            type="text"
            maxLength={200}
            className="rounded-md border border-zinc-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium">Affiliation (optional)</span>
          <span className="text-xs text-zinc-500">
            Your role, organization, or how you'd describe yourself in this
            context.
          </span>
          <input
            name="affiliation"
            type="text"
            maxLength={200}
            className="rounded-md border border-zinc-300 px-3 py-2"
          />
        </label>
        <button
          type="submit"
          className="self-start rounded-full bg-zinc-900 px-6 py-3 text-base font-medium text-white hover:bg-zinc-700"
        >
          Continue →
        </button>
      </form>
    </main>
  );
}
