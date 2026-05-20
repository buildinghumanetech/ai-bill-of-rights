import { describe, expect, it } from "vitest";
import { renderBodyWithMentions } from "@/lib/comments/render-mentions";

const signers = [
  { id: "1", displayName: "Alice" },
  { id: "2", displayName: "Bob Smith" },
];

describe("renderBodyWithMentions", () => {
  it("returns plain string when no mentions", () => {
    const result = renderBodyWithMentions("Hello world.", signers);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe("Hello world.");
  });

  it("returns [string, span, string] when one mention in the middle", () => {
    const result = renderBodyWithMentions("Hello @Alice how are you?", signers);
    expect(result).toHaveLength(3);
    expect(result[0]).toBe("Hello ");
    // result[1] is a React element
    expect(typeof result[1]).toBe("object");
    expect(result[2]).toBe(" how are you?");
  });

  it("returns array starting with span when mention is at start", () => {
    const result = renderBodyWithMentions("@Alice how are you?", signers);
    // No leading string before the mention
    expect(result).toHaveLength(2);
    expect(typeof result[0]).toBe("object"); // span
    expect(result[1]).toBe(" how are you?");
  });

  it("handles consecutive mentions", () => {
    const result = renderBodyWithMentions("@Alice and @Bob Smith!", signers);
    // [span, " and ", span, "!"]
    expect(result).toHaveLength(4);
    expect(typeof result[0]).toBe("object"); // Alice span
    expect(result[1]).toBe(" and ");
    expect(typeof result[2]).toBe("object"); // Bob Smith span
    expect(result[3]).toBe("!");
  });

  it("returns single string when signers list is empty", () => {
    const result = renderBodyWithMentions("Hello @Alice!", []);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe("Hello @Alice!");
  });

  it("returns single string when body has no mentions", () => {
    const result = renderBodyWithMentions("No at-signs here.", signers);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe("No at-signs here.");
  });
});
