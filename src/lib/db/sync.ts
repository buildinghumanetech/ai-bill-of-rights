import { createHash } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { versions } from "./schema";
import { parseDocument } from "@/lib/markdown/parse";

export interface VersionInput {
  version: string;
  publishedAt: Date;
  markdown: string;
  agentsMd: string;
  specJson: string;
  isCurrent: boolean;
  gitCommitSha: string | null;
}

function sha256Hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

export async function syncVersions(
  db: any,
  inputs: VersionInput[],
): Promise<void> {
  type VersionRow = typeof versions.$inferSelect;
  const existing: VersionRow[] = await db.select().from(versions);
  const existingByVersion = new Map(existing.map((r) => [r.version, r]));

  for (const input of inputs) {
    const markdownHash = sha256Hex(input.markdown);
    const agentsMdHash = sha256Hex(input.agentsMd);
    const specJsonHash = sha256Hex(input.specJson);

    const existingRow = existingByVersion.get(input.version);
    if (existingRow) {
      // All three files are immutable once a version has been synced, and all
      // three are checked. Only checking the markdown would let edits to
      // agents.md or spec.json pass silently: the `continue` below means the
      // stored hashes are never updated, so the row would keep serving the old
      // content at /v/<version>/agents.md and /v/<version>/spec.json with
      // nothing to indicate the files on disk had moved on.
      //
      // If this fires for a version still being drafted, clear the stale row
      // with `pnpm tsx scripts/unsync-version.ts <version> --yes` — see README.
      const mismatches: string[] = [];
      if (existingRow.markdownHash !== markdownHash) {
        mismatches.push(
          `markdown (existing ${existingRow.markdownHash} vs new ${markdownHash})`,
        );
      }
      if (existingRow.agentsMdHash !== agentsMdHash) {
        mismatches.push(
          `agents.md (existing ${existingRow.agentsMdHash} vs new ${agentsMdHash})`,
        );
      }
      if (existingRow.specJsonHash !== specJsonHash) {
        mismatches.push(
          `spec.json (existing ${existingRow.specJsonHash} vs new ${specJsonHash})`,
        );
      }
      if (mismatches.length > 0) {
        throw new Error(
          `Version ${input.version} hash mismatch: ${mismatches.join("; ")}. The canonical document text is meant to be immutable.`,
        );
      }
      // Already in sync — no-op
      continue;
    }
    const parsed = parseDocument(input.markdown);
    await db.insert(versions).values({
      version: input.version,
      publishedAt: input.publishedAt,
      markdownHash,
      agentsMdHash,
      specJsonHash,
      parsedJson: parsed,
      isCurrent: false, // set below in a single pass
      gitCommitSha: input.gitCommitSha ?? null,
      isUserFork: false,
      parentVersionId: null,
    });
  }

  // Apply isCurrent flags in one update pass.
  const currentVersions = inputs.filter((i) => i.isCurrent).map((i) => i.version);
  const nonCurrentVersions = inputs.filter((i) => !i.isCurrent).map((i) => i.version);

  if (currentVersions.length > 1) {
    throw new Error(
      `More than one version marked current: ${currentVersions.join(", ")}`,
    );
  }
  if (currentVersions.length === 1) {
    await db.update(versions).set({ isCurrent: false });
    await db
      .update(versions)
      .set({ isCurrent: true })
      .where(eq(versions.version, currentVersions[0]));
  } else if (nonCurrentVersions.length > 0) {
    await db
      .update(versions)
      .set({ isCurrent: false })
      .where(inArray(versions.version, nonCurrentVersions));
  }
}
