import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../_helpers/pglite-db";
import { syncVersions } from "@/lib/db/sync";
import { versions } from "@/lib/db/schema";
import { SAMPLE_DOC } from "../_helpers/fixtures";

const sampleInput = {
  version: "1.0.0",
  publishedAt: new Date("2026-05-18T00:00:00Z"),
  markdown: SAMPLE_DOC,
  agentsMd: "# AGENTS\n\nstub",
  specJson: '{"version":"1.0.0"}',
  isCurrent: true,
  gitCommitSha: "abc123",
};

describe("syncVersions", () => {
  it("inserts a new version with hashes and parsed_json", async () => {
    const db = await createTestDb();
    await syncVersions(db, [sampleInput]);
    const rows = await db.select().from(versions);
    expect(rows).toHaveLength(1);
    expect(rows[0].version).toBe("1.0.0");
    expect(rows[0].markdownHash).toMatch(/^[a-f0-9]{64}$/);
    expect(rows[0].isCurrent).toBe(true);
    expect(rows[0].parsedJson).toBeTruthy();
  });

  it("is idempotent when run twice with identical input", async () => {
    const db = await createTestDb();
    await syncVersions(db, [sampleInput]);
    await syncVersions(db, [sampleInput]);
    const rows = await db.select().from(versions);
    expect(rows).toHaveLength(1);
  });

  it("throws if the markdown for an existing version has changed", async () => {
    const db = await createTestDb();
    await syncVersions(db, [sampleInput]);
    await expect(
      syncVersions(db, [
        { ...sampleInput, markdown: SAMPLE_DOC + "\nappended content" },
      ]),
    ).rejects.toThrow(/hash mismatch/);
  });

  it("flips is_current to false on older versions when a newer one is current", async () => {
    const db = await createTestDb();
    await syncVersions(db, [{ ...sampleInput, isCurrent: false }]);
    await syncVersions(db, [
      { ...sampleInput, isCurrent: false },
      {
        ...sampleInput,
        version: "1.0.1",
        markdown: SAMPLE_DOC.replace("1.0.0", "1.0.1"),
        isCurrent: true,
      },
    ]);
    const v0 = await db.select().from(versions).where(eq(versions.version, "1.0.0"));
    const v1 = await db.select().from(versions).where(eq(versions.version, "1.0.1"));
    expect(v0[0].isCurrent).toBe(false);
    expect(v1[0].isCurrent).toBe(true);
  });
});
