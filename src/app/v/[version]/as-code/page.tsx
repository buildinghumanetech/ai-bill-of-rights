import fs from "node:fs";
import path from "node:path";
import { notFound } from "next/navigation";
import { AttestationForm } from "@/components/AttestationForm";

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

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <p className="text-xs uppercase tracking-widest text-zinc-500">
        Building AI? Make it public.
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">
        Implement AI Bill of Rights v{version} in your code
      </h1>
      <p className="mt-4 text-zinc-700 dark:text-zinc-300">
        Drop this file into your AI-assistant project as a binding instruction
        set. Then publicly attest that your product adheres to this version.
      </p>

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
                  ? "rounded-full bg-zinc-900 px-4 py-1 font-medium text-white dark:bg-zinc-50 dark:text-zinc-950"
                  : "rounded-full border border-zinc-300 px-4 py-1 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
              }
            >
              {TOOL_LABELS[key]}
            </a>
          );
        })}
      </nav>
      <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
        Save the file as{" "}
        <code className="rounded bg-zinc-100 px-1 py-0.5 text-xs dark:bg-zinc-800">
          {saveAsName}
        </code>{" "}
        in your project root.
      </p>

      <div className="mt-4 flex flex-wrap gap-3">
        <a
          href={`/v/${version}/agents.md`}
          download={saveAsName}
          className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white dark:bg-zinc-50 dark:text-zinc-950"
        >
          Download {saveAsName}
        </a>
        <a
          href={`/v/${version}/spec.json`}
          download={`bill-of-rights-v${version}.spec.json`}
          className="rounded-full border border-zinc-300 px-5 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
        >
          Download spec.json
        </a>
      </div>

      <h3 className="mt-6 text-sm font-semibold">curl one-liner</h3>
      <pre className="mt-2 overflow-auto rounded-md bg-zinc-100 p-3 text-xs dark:bg-zinc-900">
        <code>{curlCmd}</code>
      </pre>

      <h3 className="mt-6 text-sm font-semibold">Preview</h3>
      <pre className="mt-2 max-h-96 overflow-auto rounded-md bg-zinc-100 p-3 text-xs dark:bg-zinc-900">
        <code>{agentsContent}</code>
      </pre>

      <h2 className="mt-12 text-xl font-semibold">2. Attest publicly</h2>
      <AttestationForm version={version} />
    </main>
  );
}
