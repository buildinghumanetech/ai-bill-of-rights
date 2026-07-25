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

    it("returns nothing when two signers share a full display name", () => {
      const twoJohns = [
        { id: "1", displayName: "John Smith" },
        { id: "2", displayName: "John Smith" },
      ];
      expect(parseMentions("@John Smith please look", twoJohns)).toEqual([]);
    });

    it("does not rescan inside a consumed ambiguous mention", () => {
      // "@Erika" is ambiguous; "Ka" must not then match the "ka" tail of it.
      const signersWithKa = [
        { id: "1", displayName: "Erika Anderson" },
        { id: "2", displayName: "Erika Smith" },
        { id: "3", displayName: "Ka" },
      ];
      expect(parseMentions("@Erika hi", signersWithKa)).toEqual([]);
    });
  });

  // Boundary checks have to be Unicode-aware; an ASCII-only character class
  // treats accented letters as boundaries and mails the wrong person.
  describe("non-ASCII names", () => {
    it("does not match an ASCII prefix of an accented name", () => {
      const ana = [{ id: "1", displayName: "Ana" }];
      expect(parseMentions("@Anaïs thanks", ana)).toEqual([]);
    });

    it("does not match a short name inside a non-Latin name", () => {
      const jo = [{ id: "1", displayName: "Jo" }];
      expect(parseMentions("@Jörg hello", jo)).toEqual([]);
    });

    it("matches an accented name typed in another case", () => {
      const maria = [{ id: "1", displayName: "María Peña" }];
      const result = parseMentions("gracias @maría peña!", maria);
      expect(result).toHaveLength(1);
      expect(result[0].displayName).toBe("María Peña");
    });

    it("ignores an email address with a non-ASCII local part", () => {
      const alice = [{ id: "1", displayName: "Alice" }];
      expect(parseMentions("write josé@alice.com", alice)).toEqual([]);
      expect(parseMentions("write 田中@alice.com", alice)).toEqual([]);
    });

    it("ignores an email address with a dotted local part", () => {
      const alice = [{ id: "1", displayName: "Alice" }];
      expect(parseMentions("write bob.smith@alice.com", alice)).toEqual([]);
    });
  });

  // Display names come from user-entered profiles and are not always tidy.
  describe("untidy display names", () => {
    it("matches a name stored with doubled internal whitespace", () => {
      const doubled = [{ id: "1", displayName: "Erika  Anderson" }];
      const result = parseMentions("@Erika Anderson hi", doubled);
      expect(result).toHaveLength(1);
      expect(result[0].displayName).toBe("Erika  Anderson"); // canonical, as stored
    });

    it("does not turn a title into a mention", () => {
      // "Dr. Erika Anderson" must not make a bare "@Dr." a mention.
      const titled = [{ id: "1", displayName: "Dr. Erika Anderson" }];
      expect(parseMentions("ask @Dr. about it", titled)).toEqual([]);
    });

    it("does not use a comma-terminated token as a first name", () => {
      const inverted = [{ id: "1", displayName: "Anderson, Erika" }];
      expect(parseMentions("@Anderson, hello", inverted)).toEqual([]);
    });

    it("still matches a title-prefixed name in full", () => {
      const titled = [{ id: "1", displayName: "Dr. Erika Anderson" }];
      const result = parseMentions("thanks @Dr. Erika Anderson!", titled);
      expect(result).toHaveLength(1);
      expect(result[0].signerId).toBe("1");
    });
  });

  describe("mention openers", () => {
    it("matches a mention in parentheses", () => {
      const result = parseMentions("(@Alice) said so", signers);
      expect(result).toHaveLength(1);
      expect(result[0].signerId).toBe("3");
    });

    it("matches a mention after a newline", () => {
      const result = parseMentions("cc:\n@Alice", signers);
      expect(result).toHaveLength(1);
      expect(result[0].signerId).toBe("3");
    });

    // A whitelist of "allowed openers" silently dropped these; the rule is
    // "the @ isn't part of an email address", so punctuation must be fine.
    it.each([
      ["comma", "Hi,@Alice"],
      ["colon", "cc:@Alice"],
      ["em dash", "—@Alice"],
      ["closing quote", "”@Alice"],
      ["inverted question mark", "¿@Alice"],
      ["guillemet", "»@Alice"],
    ])("matches a mention directly after a %s", (_label, body) => {
      const result = parseMentions(body, signers);
      expect(result).toHaveLength(1);
      expect(result[0].signerId).toBe("3");
    });
  });

  // Hyphenated given names are common, and "Jean" matching inside
  // "@Jean-Pierre" is the same wrong-recipient failure as "Ana"/"@Anaïs".
  describe("hyphenated and composed names", () => {
    it("does not match a name before a hyphen", () => {
      const jean = [{ id: "1", displayName: "Jean Dupont" }];
      expect(parseMentions("@Jean-Pierre can you look?", jean)).toEqual([]);
    });

    it("does not match a first name inside another hyphenated name", () => {
      const anne = [{ id: "1", displayName: "Anne Blanc" }];
      expect(parseMentions("@Anne-Marie thanks", anne)).toEqual([]);
    });

    it("still matches a signer whose own name is hyphenated", () => {
      const hyphenated = [{ id: "1", displayName: "Anne-Marie Blanc" }];
      const result = parseMentions("@Anne-Marie thanks", hyphenated);
      expect(result).toHaveLength(1);
      expect(result[0].signerId).toBe("1");
    });

    it("does not match an ASCII prefix of a decomposed (NFD) name", () => {
      // "Anä" with the umlaut as a combining mark: renders like NFC but the
      // char after "Ana" is U+0308, which must count as a word char.
      const nfd = "@Anäs thanks";
      expect(nfd.normalize("NFC")).not.toBe(nfd); // guard: really decomposed
      expect(parseMentions(nfd, [{ id: "1", displayName: "Ana" }])).toEqual([]);
    });

    it("does not match a name before an astral letter", () => {
      // U+10450 (Shavian) is a surrogate pair; indexing would see half of it.
      const body = "@Ana\u{10450} hello";
      expect(parseMentions(body, [{ id: "1", displayName: "Ana" }])).toEqual([]);
    });

    it("matches a name followed by an apostrophe, which is not a word char", () => {
      const result = parseMentions("@Bob's point stands", signers);
      expect(result).toHaveLength(1);
      expect(result[0].signerId).toBe("4");
    });
  });

  describe("honorifics", () => {
    it("reaches a signer whose display name is honorific-prefixed", () => {
      // Regression: skipping non-name-like tokens must not drop the candidate
      // entirely, or "@Erika" notifies nobody.
      const titled = [{ id: "1", displayName: "Dr. Erika Anderson" }];
      const result = parseMentions("@Erika what do you think?", titled);
      expect(result).toHaveLength(1);
      expect(result[0].displayName).toBe("Dr. Erika Anderson");
    });

    it("still refuses a bare honorific", () => {
      const titled = [{ id: "1", displayName: "Dr. Erika Anderson" }];
      expect(parseMentions("ask @Dr. about it", titled)).toEqual([]);
    });

    it("skips the comma-terminated token and uses the given name", () => {
      const inverted = [{ id: "1", displayName: "Anderson, Erika" }];
      const result = parseMentions("@Erika hello", inverted);
      expect(result).toHaveLength(1);
      expect(result[0].signerId).toBe("1");
    });

    it("skips a bare single-letter initial to find the usable short name", () => {
      // The length rule must live inside the token search, not after it, or
      // "J" is picked and then rejected, dropping the candidate entirely.
      const initial = [{ id: "1", displayName: "J Erika Anderson" }];
      const result = parseMentions("@Erika hi", initial);
      expect(result).toHaveLength(1);
      expect(result[0].displayName).toBe("J Erika Anderson");
    });
  });

  // An @ inside a URL path is not a mention. Pasting a link to someone's
  // profile is an ordinary comment body.
  describe("URLs", () => {
    it.each([
      ["medium", "check out https://medium.com/@alice"],
      ["mastodon", "follow https://mastodon.social/@alice"],
      ["bare host", "see github.com/@alice"],
    ])("does not treat /@name in a %s URL as a mention", (_label, body) => {
      expect(parseMentions(body, signers)).toEqual([]);
    });

    it("still matches a mention on the line after a URL", () => {
      const result = parseMentions("https://example.com\n@Alice thoughts?", signers);
      expect(result).toHaveLength(1);
      expect(result[0].signerId).toBe("3");
    });

    // A slash is only a URL separator in context. Blanket-rejecting it drops
    // the natural shorthand for addressing two people.
    it("matches both mentions in @Alice/@Bob", () => {
      const result = parseMentions("@Alice/@Bob please review", signers);
      expect(result.map((m) => m.signerId)).toEqual(["3", "4"]);
    });

    it("matches a mention after a non-host slash run", () => {
      const result = parseMentions("and/or/@Alice", signers);
      expect(result).toHaveLength(1);
      expect(result[0].signerId).toBe("3");
    });

    // The URL check must not be gated on one specific preceding character, or
    // each of these reaches the wrong recipient by a different route.
    it.each([
      ["query string", "see https://example.com/p?ref=@alice"],
      ["fragment", "see https://example.com/page#@alice"],
      ["ampersand in query", "see https://x.com/l?a=1&@alice"],
      ["dotted-quad host", "see 192.168.1.5/@alice"],
      ["scheme-less dotted-quad", "see 10.0.0.7/@alice"],
    ])("does not treat @name in a %s as a mention", (_label, body) => {
      expect(parseMentions(body, signers)).toEqual([]);
    });

    // DOTTED_HOST must not be loose enough to read prose abbreviations as hosts.
    it.each([
      ["e.g.", "e.g./@Alice"],
      ["etc.", "etc./@Alice"],
    ])("still matches a mention after the abbreviation %s", (_label, body) => {
      const result = parseMentions(body, signers);
      expect(result).toHaveLength(1);
      expect(result[0].signerId).toBe("3");
    });
  });

  describe("hyphen as punctuation rather than part of a name", () => {
    it("matches a mention followed by a double hyphen", () => {
      const result = parseMentions("@Alice-- what do you think?", signers);
      expect(result).toHaveLength(1);
      expect(result[0].signerId).toBe("3");
    });

    it("matches a mention with a trailing hyphen at end of body", () => {
      const result = parseMentions("cc @Alice-", signers);
      expect(result).toHaveLength(1);
      expect(result[0].signerId).toBe("3");
    });

    // The ASCII-hyphen case is covered in "hyphenated and composed names";
    // this block only pins the typographic variants and the punctuation uses.
    // Typographic hyphens arrive via paste and autocorrect.
    it.each([
      ["U+2010 hyphen", "‐"],
      ["U+2011 non-breaking hyphen", "‑"],
    ])("rejects a partial name before a %s", (_label, hyphen) => {
      const jean = [{ id: "1", displayName: "Jean Dupont" }];
      expect(parseMentions(`@Jean${hyphen}Pierre hi`, jean)).toEqual([]);
    });
  });

  // These are deliberate non-mentions; pinning them means a future change to
  // MENTION_BLOCKER can't loosen them silently.
  describe("email-local characters before the @", () => {
    it.each([
      ["letter", "bob@alice.com"],
      ["dot", "bob.smith@alice.com"],
      ["plus", "bob+tag@alice.com"],
      ["percent", "bob%tag@alice.com"],
      ["hyphen", "bob-smith@alice.com"],
      ["underscore", "bob_smith@alice.com"],
      ["digit", "bob2@alice.com"],
      // Astral-script local part: U+10428 (Deseret) is a surrogate pair, so
      // indexing body[i-1] would see a lone low surrogate matching no property.
      ["astral letter", "\u{10428}@alice.com"],
    ])("does not open a mention after a %s", (_label, body) => {
      expect(parseMentions(`write ${body}`, signers)).toEqual([]);
    });

    it("does not judge the opener by the character before an unpaired surrogate", () => {
      // sanitizeText strips only C0/DEL, so a lone surrogate can reach here.
      // Stepping back blindly treated the char TWO positions back as the
      // opener, so these two bodies disagreed: "a" blocked the mention and "!"
      // allowed it. An unpaired surrogate is not an email-local character, so
      // both must resolve.
      const afterLetter = parseMentions("a\uDC28@Alice", signers);
      const afterPunct = parseMentions("Great!\uDC28@Alice", signers);
      expect(afterLetter.map((m) => m.signerId)).toEqual(["3"]);
      expect(afterPunct.map((m) => m.signerId)).toEqual(["3"]);
    });

    // Punctuation that an address doesn't realistically need must NOT block,
    // or ordinary prose loses its mentions.
    it.each([
      ["exclamation", "Great!@Alice"],
      ["question mark", "Really?@Alice"],
      ["tilde", "~@Alice"],
      ["ampersand", "Bob&@Alice"],
      ["hash", "#@Alice"],
      ["equals", "=@Alice"],
    ])("still opens a mention after a %s", (_label, body) => {
      const result = parseMentions(body, signers);
      expect(result).toHaveLength(1);
      expect(result[0].signerId).toBe("3");
    });
  });

  describe("documented NFC/NFD limitation", () => {
    it("fails safe when the stored name is NFD and the body is NFC", () => {
      // Pins the KNOWN LIMITATION in the module docstring: no normalization,
      // so this notifies nobody rather than risking the wrong person.
      const nfdStored = [{ id: "1", displayName: "María Peña".normalize("NFD") }];
      const nfcBody = "gracias @María Peña!".normalize("NFC");
      expect(parseMentions(nfcBody, nfdStored)).toEqual([]);
    });

    it("matches when stored name and body use the same normalization", () => {
      const nfd = "María Peña".normalize("NFD");
      const result = parseMentions(`gracias @${nfd}!`, [{ id: "1", displayName: nfd }]);
      expect(result).toHaveLength(1);
      expect(result[0].signerId).toBe("1");
    });
  });
});
