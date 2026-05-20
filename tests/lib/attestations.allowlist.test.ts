import { describe, expect, it } from "vitest";
import { needsManualReview } from "@/lib/attestations/allowlist";

describe("needsManualReview", () => {
  it("matches exact frontier-lab names case-insensitively", () => {
    expect(needsManualReview("OpenAI")).toBe(true);
    expect(needsManualReview("anthropic")).toBe(true);
    expect(needsManualReview("Google DeepMind")).toBe(true);
  });
  it("matches when frontier-lab name is a token in a longer string", () => {
    expect(needsManualReview("OpenAI Engineering")).toBe(true);
    expect(needsManualReview("Anthropic Public Benefit Corp")).toBe(true);
  });
  it("does not match unrelated org names", () => {
    expect(needsManualReview("María's Coffee Shop")).toBe(false);
    expect(needsManualReview("Random Startup Inc")).toBe(false);
  });
  it("does not match casual mentions like 'we use OpenAI's API' (treat as substring)", () => {
    expect(needsManualReview("We use OpenAI's API")).toBe(true);
  });
});
