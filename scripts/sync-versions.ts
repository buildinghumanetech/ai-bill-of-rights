import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import {
  CONTENT_ROOT,
  readVersionsIndex,
} from "@/lib/content/versions-index";

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

async function main(): Promise<void> {
  // Dynamic import so dotenv has populated process.env before the db module
  // evaluates its DATABASE_URL guard.
  const { db } = await import("@/lib/db");
  const { syncVersions } = await import("@/lib/db/sync");
  type VersionInput = Parameters<typeof syncVersions>[1][number];

  const index = readVersionsIndex();
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
