import { describe, expect, it } from "vitest";
import { parseDocument } from "@/lib/markdown/parse";
import { SAMPLE_DOC } from "../_helpers/fixtures";

describe("parseDocument", () => {
  it("extracts frontmatter", () => {
    const parsed = parseDocument(SAMPLE_DOC);
    expect(parsed.frontmatter.version).toBe("1.0.0");
    expect(parsed.frontmatter.published_at).toBeDefined();
  });

  it("extracts two articles plus the preamble", () => {
    const parsed = parseDocument(SAMPLE_DOC);
    expect(parsed.articles.map((a) => a.id)).toEqual([
      "preamble",
      "article-1",
      "article-2",
    ]);
  });

  it("extracts anchor-tagged sentences per article", () => {
    const parsed = parseDocument(SAMPLE_DOC);
    const a1 = parsed.articles.find((a) => a.id === "article-1")!;
    expect(a1.paragraphs[0].sentences.map((s) => s.id)).toEqual([
      "article-1-s-1",
      "article-1-s-2",
    ]);
    expect(a1.paragraphs[0].sentences[0].text).toContain("First sentence.");
  });

  it("strips the {#anchor} markers from emitted text", () => {
    const parsed = parseDocument(SAMPLE_DOC);
    const a1 = parsed.articles.find((a) => a.id === "article-1")!;
    const text = a1.paragraphs[0].sentences[0].text;
    expect(text).not.toContain("{#");
  });
});
