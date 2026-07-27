import { submitAttestationAction } from "@/server/actions/attestations";

interface Props {
  version: string;
}

async function handleSubmit(formData: FormData): Promise<void> {
  "use server";
  await submitAttestationAction(formData);
}

export function AttestationForm({ version }: Props) {
  return (
    <form
      action={handleSubmit}
      className="mt-6 flex flex-col gap-4 rounded-lg border border-zinc-200 p-6"
    >
      <h3 className="text-lg font-semibold">Public attestation</h3>
      <p className="text-sm text-zinc-600">
        Publicly commit that your product was built referencing this version.
        We&apos;ll send a confirmation link to your email; your attestation
        appears on{" "}
        <a href="/attestations" className="underline">
          /attestations
        </a>{" "}
        once confirmed.
      </p>
      <input type="hidden" name="version" value={version} />
      <label className="flex flex-col gap-1 text-sm">
        Organization name (required)
        <input
          name="orgName"
          type="text"
          required
          maxLength={200}
          className="rounded-md border border-zinc-300 px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Product name (required)
        <input
          name="productName"
          type="text"
          required
          maxLength={200}
          className="rounded-md border border-zinc-300 px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Product URL (optional)
        <input
          name="productUrl"
          type="url"
          maxLength={500}
          placeholder="https://"
          className="rounded-md border border-zinc-300 px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Contact email (required)
        <input
          name="contactEmail"
          type="email"
          required
          maxLength={200}
          className="rounded-md border border-zinc-300 px-3 py-2"
        />
      </label>
      <button
        type="submit"
        className="self-start rounded-full bg-zinc-900 px-6 py-3 text-base font-medium text-white hover:bg-zinc-700"
      >
        Submit attestation
      </button>
    </form>
  );
}
