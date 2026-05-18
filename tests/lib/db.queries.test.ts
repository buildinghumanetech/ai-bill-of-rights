import { describe, expect, it } from "vitest";
import { createTestDb } from "../_helpers/pglite-db";
import { syncVersions } from "@/lib/db/sync";
import { getCurrentVersion, getSignatureCount } from "@/lib/db/queries";

const sample = (version: string, isCurrent: boolean) => ({
  version,
  publishedAt: new Date(),
  markdown: `---\nversion: ${version}\n---\n# T {#preamble}\nx {#preamble-s-1}\n`,
  agentsMd: "stub",
  specJson: "{}",
  isCurrent,
  gitCommitSha: null,
});

describe("db queries", () => {
  it("getCurrentVersion returns the version flagged is_current", async () => {
    const db = await createTestDb();
    await syncVersions(db, [
      sample("1.0.0", false),
      sample("1.0.1", true),
    ]);
    const current = await getCurrentVersion(db);
    expect(current?.version).toBe("1.0.1");
  });

  it("getSignatureCount returns 0 when no signatures exist", async () => {
    const db = await createTestDb();
    const count = await getSignatureCount(db);
    expect(count).toBe(0);
  });
});
