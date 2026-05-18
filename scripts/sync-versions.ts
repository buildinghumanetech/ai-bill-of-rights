import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { db } from "@/lib/db";
import { syncVersions, type VersionInput } from "@/lib/db/sync";

const CONTENT_ROOT = path.join(process.cwd(), "content/bill-of-rights");

function readFile(name: string): string {
  return fs.readFileSync(path.join(CONTENT_ROOT, name), "utf-8");
}

function gitCommit(): string | null {
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf-8" }).trim();
  } catch {
    return null;
  }
}

interface VersionsJson {
  current: string;
  history: Array<{ version: string; published_at: string }>;
}

async function main(): Promise<void> {
  const indexPath = path.join(CONTENT_ROOT, "versions.json");
  const index: VersionsJson = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
  const sha = gitCommit();

  const inputs: VersionInput[] = index.history.map((entry) => ({
    version: entry.version,
    publishedAt: new Date(`${entry.published_at}T00:00:00Z`),
    markdown: readFile(`v${entry.version}.md`),
    agentsMd: readFile(`v${entry.version}.agents.md`),
    specJson: readFile(`v${entry.version}.spec.json`),
    isCurrent: entry.version === index.current,
    gitCommitSha: sha,
  }));

  await syncVersions(db, inputs);
  console.log(
    `Synced ${inputs.length} version(s); current = ${index.current}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
