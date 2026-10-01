import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readVersionsIndex } from "@/lib/content/versions-index";

describe("version levels in versions.json", () => {
  it("gives every published version a level, and marks 0.1.0 major", () => {
    const index = readVersionsIndex();
    for (const entry of index.history) {
      expect(["major", "minor"]).toContain(entry.level);
    }
    expect(index.history.find((h) => h.version === "0.1.0")?.level).toBe("major");
  });

  it("rejects a level that is neither major nor minor", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "versions-"));
    fs.writeFileSync(
      path.join(dir, "versions.json"),
      JSON.stringify({
        current: "0.1.0",
        history: [{ version: "0.1.0", published_at: "2026-07-24", level: "patch" }],
      }),
    );
    expect(() => readVersionsIndex(dir)).toThrow(/level must be "major" or "minor"/);
  });
});
