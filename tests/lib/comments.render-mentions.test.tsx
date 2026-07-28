import { describe, expect, it } from "vitest";
import { renderBodyWithMentions } from "@/lib/comments/render-mentions";

const signers = [
  { id: "1", displayName: "Alice" },
  { id: "2", displayName: "Bob Smith" },
];

/** The visible text of a rendered mention span. */
function spanText(node: unknown): string {
  return (node as { props: { children: string } }).props.children;
}

describe("renderBodyWithMentions", () => {
  it("returns plain string when nothing was mentioned", () => {
    const result = renderBodyWithMentions("Hello world.", signers, []);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe("Hello world.");
  });

  it("returns [string, span, string] when one mention is in the middle", () => {
    const result = renderBodyWithMentions("Hello @Alice how are you?", signers, ["1"]);
    expect(result).toHaveLength(3);
    expect(result[0]).toBe("Hello ");
    expect(spanText(result[1])).toBe("@Alice");
    expect(result[2]).toBe(" how are you?");
  });

  it("starts with the span when the mention is at the start", () => {
    const result = renderBodyWithMentions("@Alice how are you?", signers, ["1"]);
    expect(result).toHaveLength(2);
    expect(spanText(result[0])).toBe("@Alice");
    expect(result[1]).toBe(" how are you?");
  });

  it("handles two mentions in one body", () => {
    const result = renderBodyWithMentions("@Alice and @Bob Smith!", signers, ["1", "2"]);
    expect(result).toHaveLength(4);
    expect(spanText(result[0])).toBe("@Alice");
    expect(result[1]).toBe(" and ");
    expect(spanText(result[2])).toBe("@Bob Smith");
    expect(result[3]).toBe("!");
  });

  it("does not highlight a name the author typed by hand", () => {
    // THE POINT OF THIS MODULE. Highlighting is driven by the `comment_mentions`
    // rows — the signers the author actually picked from the typeahead — and
    // those rows are what the notification was sent on. A hand-typed name has no
    // row, notifies nobody, and so must not be dressed up to look like it did.
    // Rendering it as a styled mention was a promise the delivery path never kept.
    const result = renderBodyWithMentions("Hello @Alice!", signers, []);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe("Hello @Alice!");
  });

  it("highlights only the picked signer when another name is typed alongside", () => {
    const result = renderBodyWithMentions("@Alice and @Bob Smith!", signers, ["1"]);
    expect(result).toHaveLength(2);
    expect(spanText(result[0])).toBe("@Alice");
    expect(result[1]).toBe(" and @Bob Smith!");
  });

  it("returns a single string when the signer list is empty", () => {
    const result = renderBodyWithMentions("Hello @Alice!", [], ["1"]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe("Hello @Alice!");
  });

  it("ignores a mention row whose signer is no longer mentionable", () => {
    // Rows outlive the signer list they were written against. An id that no
    // longer resolves has no display name, so there is no needle to look for.
    const result = renderBodyWithMentions("Hello @Alice!", signers, ["deleted"]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe("Hello @Alice!");
  });

  it("requires an exact match, so a differently-cased name stays plain", () => {
    // The needle comes from `mentionText(displayName)` — byte-identical to what
    // the composer inserted and to what the server checked before notifying.
    // "@bob smith" is not that string, so Bob was not picked here.
    const result = renderBodyWithMentions("ok @bob smith said so", signers, ["2"]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe("ok @bob smith said so");
  });

  it("highlights every occurrence when one signer is mentioned twice", () => {
    const result = renderBodyWithMentions("@Alice ping @Alice", signers, ["1"]);
    expect(result).toHaveLength(3);
    expect(spanText(result[0])).toBe("@Alice");
    expect(result[1]).toBe(" ping ");
    expect(spanText(result[2])).toBe("@Alice");
  });

  it("prefers the longer name when one display name is a prefix of another", () => {
    // "@Erik" occurs inside "@Erika Anderson". Both were picked, so both have
    // rows, and the highlight must not chop Erika's name in half.
    const overlapping = [
      { id: "e1", displayName: "Erik" },
      { id: "e2", displayName: "Erika Anderson" },
    ];
    const result = renderBodyWithMentions("cc @Erika Anderson", overlapping, ["e1", "e2"]);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe("cc ");
    expect(spanText(result[1])).toBe("@Erika Anderson");
  });

  it("does not slice a longer hand-typed name that contains a picked one", () => {
    // Erik was picked; "@Erika Anderson" was typed by hand and has no row. The
    // needle "@Erik" is literally present inside it, so a naive scan would style
    // "@Erik" and leave "a Anderson" plain — attributing someone else's name to
    // Erik. Longest-wins cannot catch this: there is no competing range, because
    // Erika was never picked.
    //
    // Erik genuinely was mailed (`resolveSubmittedMentions` has the same
    // over-keep, documented in resolved-mentions.ts), so nothing is lying here.
    // But a half-highlighted name reads as a rendering bug, and under-
    // highlighting is the safe direction.
    const overlapping = [
      { id: "e1", displayName: "Erik" },
      { id: "e2", displayName: "Erika Anderson" },
    ];
    const result = renderBodyWithMentions("cc @Erika Anderson", overlapping, ["e1"]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe("cc @Erika Anderson");
  });

  it("does not highlight a picked name inside an email address", () => {
    // `alice@Erik.com` contains "@Erik" and the next character is a dot, so a
    // trailing-only boundary check waves it through. This is the `bob!@alice.com`
    // family of false positive the whole write-time design exists to prevent —
    // pinned on the delivery side in tests/server/comments.test.ts. A guard that
    // checked only one edge would quietly reintroduce it on the display side.
    const erik = [{ id: "e1", displayName: "Erik" }];
    const result = renderBodyWithMentions("write alice@Erik.com today", erik, ["e1"]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe("write alice@Erik.com today");
  });

  it("does not slice a handle that starts with a picked name", () => {
    // "_" is neither \p{L} nor \p{N}, so a class built from those two alone lets
    // "@Erik_dev" render as a styled "@Erik" plus a plain "_dev".
    const erik = [{ id: "e1", displayName: "Erik" }];
    const result = renderBodyWithMentions("cc @Erik_dev please", erik, ["e1"]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe("cc @Erik_dev please");
  });

  it("highlights a mention butted against non-Latin prose", () => {
    // THE CASE A CHARACTER CLASS CANNOT SERVE. Japanese and Chinese do not put
    // spaces around a mention, so a Unicode-wide "word character" guard on either
    // edge means a genuinely picked mention NEVER highlights for those authors —
    // the feature simply does not work in those languages.
    //
    // Both edges have to allow it, so both are asserted.
    const erik = [{ id: "e1", displayName: "Erik" }];
    const leading = renderBodyWithMentions("よろしく@Erik", erik, ["e1"]);
    expect(leading[0]).toBe("よろしく");
    expect(spanText(leading[1])).toBe("@Erik");
    const trailing = renderBodyWithMentions("@Erikさん、ありがとう", erik, ["e1"]);
    expect(spanText(trailing[0])).toBe("@Erik");
    expect(trailing[1]).toBe("さん、ありがとう");
  });

  it("still suppresses a run-on when the run-on is a longer known name", () => {
    // The protection that survives dropping the Unicode class: it asks whether a
    // longer KNOWN name starts here, which is script-neutral. So a CJK author is
    // still protected from the mis-attribution the class was guarding against,
    // without losing highlighting on ordinary prose.
    const signers2 = [
      { id: "e1", displayName: "Erik" },
      { id: "e2", displayName: "Erikさん" },
    ];
    const result = renderBodyWithMentions("cc @Erikさん", signers2, ["e1"]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe("cc @Erikさん");
  });

  it("sees through a combining mark to the email local part behind it", () => {
    // THE CASE THE PREVIOUS ROUND CLAIMED TO FIX AND DID NOT. In NFD, `andré`
    // ends with U+0301 sitting immediately before the `@`. That is not an
    // EMAIL_LOCAL_CHAR, so a guard reading `body[at - 1]` directly waves the
    // whole address through. The walk-back resolves it to base `e`, which is
    // ASCII, and the address stays plain.
    //
    // The previous round's test used a mark AFTER the needle, so it passed while
    // the case in its own commit message stayed broken.
    const erik = [{ id: "e1", displayName: "Erik" }];
    // Both spellings are written as explicit escapes. A literal depends on how
    // the file happens to be encoded, and an editor normalising it would swap
    // which case is under test without anyone noticing.
    const nfd = "write andre\u0301@Erik.com today"; // e + combining acute
    const nfc = "write andr\u00e9@Erik.com today"; // precomposed e-acute
    for (const body of [nfd, nfc]) {
      const result = renderBodyWithMentions(body, erik, ["e1"]);
      expect(result).toHaveLength(1);
      expect(result[0]).toBe(body);
    }
  });

  it("still highlights after a non-ASCII base character carrying a mark", () => {
    // The walk-back must not become a Unicode-wide guard by the back door.
    // Devanagari `मुझे` ends in a combining vowel sign over base `झ`, which is
    // not ASCII — so this is prose, not an address, and it highlights. Same
    // reasoning as CJK above.
    const erik = [{ id: "e1", displayName: "Erik" }];
    const result = renderBodyWithMentions("मुझे@Erik", erik, ["e1"]);
    expect(spanText(result[1])).toBe("@Erik");
  });

  it("treats a combining mark as part of the preceding word", () => {
    // A grapheme ending in a combining mark reads as non-wordish to a
    // \p{L}/\p{N} class, so `मुझे@Erik.com` (final े is \p{Mn}) slipped the
    // trailing guard. Here the mark follows the mention and must suppress it.
    const erik = [{ id: "e1", displayName: "Erik" }];
    const result = renderBodyWithMentions("cc @Eriḱx", erik, ["e1"]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe("cc @Eriḱx");
  });

  it("is not fooled by an astral character before the at-sign", () => {
    // 𝐀 (U+1D400) is astral, so `body[at - 1]` is a lone LOW surrogate. It must
    // not be mistaken for an email local part character — this is a real mention
    // and must still highlight.
    const erik = [{ id: "e1", displayName: "Erik" }];
    const result = renderBodyWithMentions("cc \u{1D400}@Erik", erik, ["e1"]);
    expect(result).toHaveLength(2);
    expect(spanText(result[1])).toBe("@Erik");
  });

  it("still highlights a picked name followed by punctuation or end of text", () => {
    // The boundary check above must not swallow ordinary endings.
    const overlapping = [{ id: "e1", displayName: "Erik" }];
    expect(renderBodyWithMentions("cc @Erik, thanks", overlapping, ["e1"])).toHaveLength(3);
    expect(renderBodyWithMentions("cc @Erik", overlapping, ["e1"])).toHaveLength(2);
    expect(renderBodyWithMentions("cc @Erik's idea", overlapping, ["e1"])).toHaveLength(3);
  });

  it("does not crash on a display name containing regex metacharacters", () => {
    // Matching is plain `indexOf`, never a constructed regex, so nothing here
    // needs escaping and no metacharacter can change the match semantics.
    const odd = [{ id: "x", displayName: "A. (Bob) Smith+" }];
    const result = renderBodyWithMentions("hi @A. (Bob) Smith+ there", odd, ["x"]);
    expect(result).toHaveLength(3);
    expect(spanText(result[1])).toBe("@A. (Bob) Smith+");
  });

  it("gives sibling mentions distinct React keys", () => {
    // Two spans for the same signer would collide on a signer-id-only key.
    const result = renderBodyWithMentions("@Alice ping @Alice", signers, ["1"]);
    const keys = result
      .filter((n) => typeof n === "object")
      .map((n) => (n as { key: string | null }).key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
