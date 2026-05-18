import { describe, expect, it } from "vitest";
import { sha256Hex } from "@/lib/consent/hash";

describe("sha256Hex", () => {
  it("returns a stable hex digest", () => {
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});
