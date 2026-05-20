import { describe, expect, it } from "vitest";
import { parseMentions } from "@/lib/comments/mentions";

const signers = [
  { id: "1", displayName: "Daniel Odio" },
  { id: "2", displayName: "Dan" },
  { id: "3", displayName: "Alice" },
  { id: "4", displayName: "Bob Smith" },
];

describe("parseMentions", () => {
  it("matches a single mention", () => {
    const result = parseMentions("Hello @Alice how are you?", signers);
    expect(result).toHaveLength(1);
    expect(result[0].signerId).toBe("3");
    expect(result[0].displayName).toBe("Alice");
    expect(result[0].matchStart).toBe(6);
    expect(result[0].matchEnd).toBe(12);
  });

  it("matches multiple mentions", () => {
    const result = parseMentions("Hey @Alice and @Bob Smith!", signers);
    expect(result).toHaveLength(2);
    expect(result[0].signerId).toBe("3"); // Alice
    expect(result[1].signerId).toBe("4"); // Bob Smith
  });

  it("dedupes by signerId — only one result per signer even if mentioned twice", () => {
    const result = parseMentions("@Alice and @Alice again", signers);
    expect(result).toHaveLength(1);
    expect(result[0].signerId).toBe("3");
  });

  it("prefers longer matches over shorter ones (e.g. Daniel Odio over Dan)", () => {
    const result = parseMentions("Thanks @Daniel Odio!", signers);
    expect(result).toHaveLength(1);
    expect(result[0].signerId).toBe("1"); // Daniel Odio, not Dan
    expect(result[0].displayName).toBe("Daniel Odio");
  });

  it("skips invalid @xxx where xxx doesn't match any signer", () => {
    const result = parseMentions("Hello @unknown!", signers);
    expect(result).toHaveLength(0);
  });

  it("returns empty array when body has no @ signs", () => {
    const result = parseMentions("No mentions here.", signers);
    expect(result).toHaveLength(0);
  });

  it("returns empty array when signers list is empty", () => {
    const result = parseMentions("@Alice is here", []);
    expect(result).toHaveLength(0);
  });

  it("matches mention at the start of the body", () => {
    const result = parseMentions("@Alice how are you?", signers);
    expect(result).toHaveLength(1);
    expect(result[0].signerId).toBe("3");
    expect(result[0].matchStart).toBe(0);
  });

  it("matches mention at the end of the body", () => {
    const result = parseMentions("Hello @Dan", signers);
    // Dan vs Daniel Odio — "Dan" comes after "@D" but Daniel Odio is longer
    // In this case the text is exactly "Dan" so Daniel Odio won't match (needs more chars)
    expect(result).toHaveLength(1);
    expect(result[0].signerId).toBe("2"); // Dan
  });
});
