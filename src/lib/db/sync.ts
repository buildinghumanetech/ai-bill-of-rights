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
      if (existingRow.markdownHash !== markdownHash) {
        throw new Error(
          `Version ${input.version} hash mismatch: existing ${existingRow.markdownHash} vs new ${markdownHash}. The canonical document text is meant to be immutable.`,
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
