import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

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
  // Dynamic import so dotenv has populated process.env before the db module
  // evaluates its DATABASE_URL guard.
  const { db } = await import("@/lib/db");
  const { syncVersions } = await import("@/lib/db/sync");
  type VersionInput = Parameters<typeof syncVersions>[1][number];

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
