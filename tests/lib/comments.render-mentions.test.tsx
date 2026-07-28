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

  it("reads whole code points at the boundary, not UTF-16 units", () => {
    // `body[i]` hands back a lone surrogate for an astral character, and a
    // u-flagged class never matches one — so a mention butted against an astral
    // letter would slip past a naive guard. 𝐀 (U+1D400) is \p{L} and astral.
    const erik = [{ id: "e1", displayName: "Erik" }];
    const result = renderBodyWithMentions("cc @Erik\u{1D400}x", erik, ["e1"]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe("cc @Erik\u{1D400}x");
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
