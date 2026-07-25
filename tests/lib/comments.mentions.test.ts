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

  // People type mentions by hand — there is no autocomplete in the composer —
  // so the cases below are what actually shows up in real comment bodies.
  describe("hand-typed names", () => {
    it("matches case-insensitively", () => {
      const result = parseMentions("hey @alice and @DANIEL ODIO", signers);
      expect(result.map((m) => m.signerId)).toEqual(["3", "1"]);
    });

    it("reports the canonical display name even when typed in another case", () => {
      const result = parseMentions("hey @alice", signers);
      expect(result[0].displayName).toBe("Alice");
    });

    it("matches a first name alone (@Bob reaches Bob Smith)", () => {
      const result = parseMentions("thanks @Bob!", signers);
      expect(result).toHaveLength(1);
      expect(result[0].signerId).toBe("4");
      expect(result[0].displayName).toBe("Bob Smith");
      expect(result[0].matchEnd).toBe(11); // "@Bob", not "@Bob Smith"
    });

    it("still prefers the full name when the whole thing is typed", () => {
      const result = parseMentions("thanks @Bob Smith!", signers);
      expect(result).toHaveLength(1);
      expect(result[0].matchEnd).toBe(17); // consumed "@Bob Smith"
    });

    it("lets a signer whose full name is a first name win over another's first name", () => {
      // "Dan" is a full display name; "Daniel Odio" contributes first name "Daniel".
      const withDanielFirst = [
        { id: "1", displayName: "Dan Brown" },
        { id: "2", displayName: "Dan" },
      ];
      const result = parseMentions("@Dan hello", withDanielFirst);
      expect(result).toHaveLength(1);
      expect(result[0].signerId).toBe("2");
    });

    it("matches a mention followed by an apostrophe", () => {
      const result = parseMentions("@Alice's point stands", signers);
      expect(result).toHaveLength(1);
      expect(result[0].signerId).toBe("3");
      expect(result[0].matchEnd).toBe(6);
    });
  });

  // Notifying the wrong person is worse than notifying nobody.
  describe("refuses to guess", () => {
    it("returns nothing when a first name is ambiguous", () => {
      const twoErikas = [
        { id: "1", displayName: "Erika Anderson" },
        { id: "2", displayName: "Erika Smith" },
      ];
      expect(parseMentions("@Erika what do you think?", twoErikas)).toEqual([]);
    });

    it("resolves an ambiguous first name once the full name is typed", () => {
      const twoErikas = [
        { id: "1", displayName: "Erika Anderson" },
        { id: "2", displayName: "Erika Smith" },
      ];
      const result = parseMentions("@Erika Smith hi", twoErikas);
      expect(result).toHaveLength(1);
      expect(result[0].signerId).toBe("2");
    });

    it("does not match a shorter name inside a longer typed name", () => {
      // A signer named "Erik" must not be notified by "@Erika".
      const erikOnly = [{ id: "1", displayName: "Erik" }];
      expect(parseMentions("@Erika hello", erikOnly)).toEqual([]);
    });

    it("ignores the @ inside an email address", () => {
      const result = parseMentions("reach me at bob@alice.com", signers);
      expect(result).toEqual([]);
    });

    it("ignores signers with a blank display name", () => {
      const blank = [{ id: "1", displayName: "   " }];
      expect(parseMentions("@ hello", blank)).toEqual([]);
    });
  });
});
