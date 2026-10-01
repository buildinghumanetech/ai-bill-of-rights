import { describe, expect, it } from "vitest";
import { wantsVersionEmail } from "@/lib/email/version-policy";

describe("wantsVersionEmail", () => {
  it.each([
    ["major", "major", true],
    ["major", "minor", false],
    ["minor", "major", true],
    ["minor", "minor", true],
    ["none", "major", false],
    ["none", "minor", false],
  ] as const)("%s subscriber, %s version: %s", (preference, level, expected) => {
    expect(wantsVersionEmail(preference, level)).toBe(expected);
  });
});
