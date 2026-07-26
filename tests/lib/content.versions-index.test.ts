import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  readVersionsIndex,
  versionFileNames,
  versionRestorability,
} from "@/lib/content/versions-index";

/**
 * `versionRestorability` is the predicate that decides whether deleting the
 * CURRENT version row is recoverable. Getting it wrong in either direction is
 * expensive: too strict and a stale leftover is undeletable, too loose and the
 * site is left with no current version permanently.
 */

const dirs: string[] = [];

function tmpContentRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "versions-index-"));
  dirs.push(dir);
  return dir;
}

function writeIndex(root: string, index: unknown) {
  fs.writeFileSync(path.join(root, "versions.json"), JSON.stringify(index));
}

/** Write all three files sync-versions reads for a version. */
function writeVersionFiles(root: string, version: string) {
  for (const name of versionFileNames(version)) {
    fs.writeFileSync(path.join(root, name), "stub");
  }
}

afterEach(() => {
  while (dirs.length) fs.rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe("readVersionsIndex", () => {
  it("reads a well-formed index", () => {
    const root = tmpContentRoot();
    writeIndex(root, {
      current: "0.1.0",
      history: [{ version: "0.1.0", published_at: "2026-07-24" }],
    });

    expect(readVersionsIndex(root).current).toBe("0.1.0");
  });

  it("names the file when it is missing, rather than surfacing a raw ENOENT", () => {
    const root = tmpContentRoot();
    expect(() => readVersionsIndex(root)).toThrow(/versions\.json/);
  });

  it("names the file when it is malformed JSON", () => {
    const root = tmpContentRoot();
    fs.writeFileSync(path.join(root, "versions.json"), "{ nope");
    expect(() => readVersionsIndex(root)).toThrow(/not valid JSON/);
  });

  it("rejects a structurally wrong index instead of returning it", () => {
    // Without this, a missing `history` surfaces three frames later as
    // "…is not iterable" from whichever caller mapped over it.
    const root = tmpContentRoot();
    writeIndex(root, { current: "0.1.0" });
    expect(() => readVersionsIndex(root)).toThrow(/history/);
  });
});

describe("versionRestorability", () => {
  it("is restorable when the version is in history and all three files exist", () => {
    const root = tmpContentRoot();
    writeIndex(root, {
      current: "0.1.0",
      history: [{ version: "0.1.0", published_at: "2026-07-24" }],
    });
    writeVersionFiles(root, "0.1.0");

    expect(versionRestorability("0.1.0", root)).toEqual({ restorable: true });
  });

  it("is not restorable when the version is absent from history", () => {
    const root = tmpContentRoot();
    writeIndex(root, { current: "0.0.1", history: [] });
    writeVersionFiles(root, "0.1.0");

    const verdict = versionRestorability("0.1.0", root);
    expect(verdict.restorable).toBe(false);
  });

  it.each(versionFileNames("0.1.0"))(
    "is not restorable when %s is missing, even though history lists it",
    (missing) => {
      // The gap a history-membership-only check leaves: sync-versions reads all
      // THREE files per entry, so a renamed markdown or spec passes the history
      // check, the delete succeeds, and the follow-up sync throws ENOENT before
      // inserting anything — the exact permanent state the guard exists to stop.
      const root = tmpContentRoot();
      writeIndex(root, {
        current: "0.1.0",
        history: [{ version: "0.1.0", published_at: "2026-07-24" }],
      });
      writeVersionFiles(root, "0.1.0");
      fs.rmSync(path.join(root, missing));

      const verdict = versionRestorability("0.1.0", root);
      expect(verdict.restorable).toBe(false);
      // Names the file to put back.
      if (verdict.restorable) throw new Error("unreachable");
      expect(verdict.reason).toContain(missing);
    },
  );

  it("is not restorable when versions.json itself cannot be read", () => {
    // Reported as a refusal rather than thrown: the caller is deciding whether
    // a delete is safe, and "I could not tell" must not read as "yes".
    const root = tmpContentRoot();
    const verdict = versionRestorability("0.1.0", root);
    expect(verdict.restorable).toBe(false);
  });
});

describe("the real content directory", () => {
  it("can restore the current version", () => {
    // A standing check on the repo itself: if this fails, `unsync-version
    // --allow-current` would refuse, and the frozen-draft remedy in README.md
    // has no working path.
    const index = readVersionsIndex();
    expect(versionRestorability(index.current)).toEqual({ restorable: true });
  });
});
