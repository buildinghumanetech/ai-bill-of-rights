import fs from "node:fs";
import path from "node:path";
import { notFound } from "next/navigation";
import { AttestationForm } from "@/components/AttestationForm";
import {
  listPublishedAttestations,
  type AttestationListItem,
} from "@/lib/db/queries";

export const dynamic = "force-dynamic";

const TOOL_FILENAMES: Record<string, string> = {
  "claude-code": "CLAUDE.md",
  cursor: ".cursorrules",
  copilot: ".github/copilot-instructions.md",
  generic: "AGENTS.md",
};

const TOOL_LABELS: Record<string, string> = {
  "claude-code": "Claude Code",
  cursor: "Cursor",
  copilot: "Copilot",
  generic: "Generic",
};

export default async function AsCodePage({
  params,
  searchParams,
}: {
  params: Promise<{ version: string }>;
  searchParams: Promise<{ tool?: string }>;
}) {
  const { version } = await params;
  const { tool = "generic" } = await searchParams;
  const toolKey = TOOL_FILENAMES[tool] ? tool : "generic";
  const saveAsName = TOOL_FILENAMES[toolKey];

  if (!/^\d+\.\d+\.\d+$/.test(version)) notFound();
  const agentsPath = path.join(
    process.cwd(),
    "content/bill-of-rights",
    `v${version}.agents.md`,
  );
  if (!fs.existsSync(agentsPath)) notFound();
  const agentsContent = fs.readFileSync(agentsPath, "utf-8");
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const curlCmd = `curl -fsSL ${siteUrl}/v/${version}/agents.md > ${saveAsName}`;

  let attestors: AttestationListItem[] = [];
  let attestorsFailed = false;
  try {
    attestors = await listPublishedAttestations(undefined, {
      limit: 100,
      offset: 0,
      versionString: version,
    });
  } catch {
    attestorsFailed = true;
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <p className="text-xs uppercase tracking-widest text-zinc-500">
        Building AI? Make it public.
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">
        Implement AI Bill of Rights v{version} in your code
      </h1>
      <p className="mt-4 text-zinc-700">
        Drop this file into your AI-assistant project as a binding instruction
        set. Then publicly attest that your product adheres to this version.
      </p>

      <section className="mt-8 rounded-2xl border border-zinc-200 bg-zinc-50 p-6">
        <p className="text-zinc-800">
          If we&apos;re asking AI builders to live up to these principles, we
          have an obligation to make them easy to implement.
        </p>
        <p className="mt-3 text-zinc-700">
          Our community is turning these articles into code you can drop into
          your AI systems &mdash; runnable checks, prompts, and policies, not
          just words on a page.
        </p>
        <p className="mt-3 text-zinc-700">
          This project is evolving.{" "}
          <a
            href="https://github.com/buildinghumanetech/ai-bill-of-rights"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-blue-600 underline-offset-4 hover:underline"
          >
            Join us on GitHub &rarr;
          </a>
        </p>
      </section>

      <h2 className="mt-10 text-xl font-semibold">1. Get the file</h2>
      <nav className="mt-4 flex flex-wrap gap-2 text-sm">
        {Object.keys(TOOL_FILENAMES).map((key) => {
          const active = key === toolKey;
          return (
            <a
              key={key}
              href={`/v/${version}/as-code?tool=${key}`}
              className={
                active
                  ? "rounded-full bg-zinc-900 px-4 py-1 font-medium text-white"
                  : "rounded-full border border-zinc-300 px-4 py-1 text-zinc-700 hover:bg-zinc-100"
              }
            >
              {TOOL_LABELS[key]}
            </a>
          );
        })}
      </nav>
      <p className="mt-3 text-sm text-zinc-600">
        Save the file as{" "}
        <code className="rounded bg-zinc-100 px-1 py-0.5 text-xs">
          {saveAsName}
        </code>{" "}
        in your project root.
      </p>

      <div className="mt-4 flex flex-wrap gap-3">
        <a
          href={`/v/${version}/agents.md`}
          download={saveAsName}
          className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white"
        >
          Download {saveAsName}
        </a>
        <a
          href={`/v/${version}/spec.json`}
          download={`bill-of-rights-v${version}.spec.json`}
          className="rounded-full border border-zinc-300 px-5 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
        >
          Download spec.json
        </a>
      </div>

      <h3 className="mt-6 text-sm font-semibold">curl one-liner</h3>
      <pre className="mt-2 overflow-auto rounded-md bg-zinc-100 p-3 text-xs">
        <code>{curlCmd}</code>
      </pre>

      <h3 className="mt-6 text-sm font-semibold">Preview</h3>
      <pre className="mt-2 max-h-96 overflow-auto rounded-md bg-zinc-100 p-3 text-xs">
        <code>{agentsContent}</code>
      </pre>

      <h2 className="mt-12 text-xl font-semibold">2. Attest publicly</h2>
      <AttestationForm version={version} />

      <h2 className="mt-12 text-xl font-semibold">
        Builders who&apos;ve attested to v{version}
      </h2>
      <p className="mt-2 text-sm text-zinc-600">
        Products that have publicly committed to building against this version.
      </p>

      {attestorsFailed ? (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center text-sm text-amber-900">
          We couldn&apos;t load the attestation list right now. Try again in a
          moment.
        </div>
      ) : attestors.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-8 text-center">
          <p className="text-base font-medium text-zinc-900">
            No attestations yet.
          </p>
          <p className="mt-1 text-sm text-zinc-600">
            Be the first &mdash; submit the form above.
          </p>
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-zinc-200">
            <thead className="bg-zinc-50">
              <tr>
                <th
                  scope="col"
                  className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-zinc-600"
                >
                  Product
                </th>
                <th
                  scope="col"
                  className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-zinc-600"
                >
                  Organization
                </th>
                <th
                  scope="col"
                  className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider text-zinc-600"
                >
                  Attested
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 bg-white">
              {attestors.map((a) => (
                <tr
                  key={a.id}
                  className="transition-colors hover:bg-zinc-50"
                >
                  <td className="whitespace-nowrap px-6 py-4">
                    {a.productUrl ? (
                      <a
                        href={a.productUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-zinc-950 hover:text-blue-600 hover:underline"
                      >
                        {a.productName}
                      </a>
                    ) : (
                      <span className="font-medium text-zinc-950">
                        {a.productName}
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-zinc-700">
                    {a.orgName}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-right text-sm text-zinc-500">
                    {a.claimedAt instanceof Date
                      ? a.claimedAt.toLocaleDateString("en-US", {
                          month: "long",
                          day: "numeric",
                          year: "numeric",
                        })
                      : String(a.claimedAt).slice(0, 10)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
