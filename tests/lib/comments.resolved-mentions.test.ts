import { describe, expect, it } from "vitest";
import {
  appendResolvedMentions,
  mentionText,
  pruneResolvedMentions,
  readSubmittedMentions,
  resolveSubmittedMentions,
  type ResolvedMention,
} from "@/lib/comments/resolved-mentions";

const ALICE = { id: "sig-alice", displayName: "Alice Nguyen" };
const ERIK = { id: "sig-erik", displayName: "Erik" };
const ERIKA = { id: "sig-erika", displayName: "Erika Anderson" };
const KNOWN = [ALICE, ERIK, ERIKA];

function pick(s: { id: string; displayName: string }): ResolvedMention {
  return { signerId: s.id, displayName: s.displayName };
}

describe("mentionText", () => {
  it("is the exact text the composer inserts", () => {
    expect(mentionText("Alice Nguyen")).toBe("@Alice Nguyen");
  });
});

describe("pruneResolvedMentions", () => {
  it("keeps a pick whose inserted text is still present", () => {
    const body = "thanks @Alice Nguyen for the review";
    expect(pruneResolvedMentions(body, [pick(ALICE)])).toEqual([pick(ALICE)]);
  });

  it("drops a pick the author deleted", () => {
    expect(pruneResolvedMentions("thanks for the review", [pick(ALICE)])).toEqual([]);
  });

  it("drops a pick when the inserted name is gone", () => {
    // Hand-edited so the inserted text no longer appears. We no longer know who
    // is meant, so nobody is notified — silence, never a wrong recipient.
    expect(pruneResolvedMentions("thanks @Alicia Nguyen", [pick(ALICE)])).toEqual([]);
  });

  it("keeps a pick when the edited text still contains the inserted name", () => {
    // The documented over-keep: appending to the name leaves "@Alice Nguyen"
    // present, so Alice stays resolved. See the module header — this can only
    // over-keep someone the author did pick, never invent one they didn't.
    expect(pruneResolvedMentions("thanks @Alice Nguyenn", [pick(ALICE)])).toEqual([
      pick(ALICE),
    ]);
  });

  it("keeps multiple distinct picks", () => {
    const body = "@Erik and @Erika Anderson should both see this";
    expect(pruneResolvedMentions(body, [pick(ERIK), pick(ERIKA)])).toEqual([
      pick(ERIK),
      pick(ERIKA),
    ]);
  });

  it("does not resurrect a removed pick because a longer name contains it", () => {
    // "@Erika Anderson" contains "@Erik" as a substring. Erik was never picked,
    // so he must not appear — this is the exact bug class the old prefix matcher
    // had (@Erika notifying Erik).
    const body = "thanks @Erika Anderson";
    expect(pruneResolvedMentions(body, [pick(ERIKA)])).toEqual([pick(ERIKA)]);
  });

  it("keeps a substring name only when it was actually picked", () => {
    // Erik WAS picked and "@Erik" is present (inside "@Erika Anderson"), so he
    // survives. This is a deliberate, documented consequence of containment:
    // it can over-keep a pick the author made, never invent one they didn't.
    const body = "thanks @Erika Anderson";
    expect(pruneResolvedMentions(body, [pick(ERIK)])).toEqual([pick(ERIK)]);
  });

  it("dedupes repeated picks of the same signer", () => {
    const body = "@Alice Nguyen ... @Alice Nguyen";
    expect(pruneResolvedMentions(body, [pick(ALICE), pick(ALICE)])).toEqual([
      pick(ALICE),
    ]);
  });

  it("handles a display name containing regex metacharacters", () => {
    const odd = { id: "sig-odd", displayName: "A. (Bob) Smith+Co [x]" };
    const body = `hi @${odd.displayName} please look`;
    expect(pruneResolvedMentions(body, [pick(odd)])).toEqual([pick(odd)]);
    expect(pruneResolvedMentions("hi @A. Bob Smith", [pick(odd)])).toEqual([]);
  });

  it("returns an empty list when nothing was picked", () => {
    expect(pruneResolvedMentions("hey @Alice Nguyen", [])).toEqual([]);
  });
});

describe("the wire contract", () => {
  it("round-trips resolved mentions through FormData", () => {
    const fd = new FormData();
    appendResolvedMentions(fd, [pick(ALICE), pick(ERIK)]);
    expect(readSubmittedMentions(fd)).toEqual({
      fromComposer: true,
      signerIds: [ALICE.id, ERIK.id],
    });
  });

  it("marks the source even with no mentions, so 'none' is distinguishable", () => {
    // "Resolved and found none" must not look like "carried no resolution" —
    // the first notifies nobody, the second is a warning about a broken client.
    const fd = new FormData();
    appendResolvedMentions(fd, []);
    expect(readSubmittedMentions(fd)).toEqual({ fromComposer: true, signerIds: [] });
  });

  it("reports fromComposer: false for a submission with no marker", () => {
    expect(readSubmittedMentions(new FormData())).toEqual({
      fromComposer: false,
      signerIds: [],
    });
  });

  it("ignores empty id values", () => {
    const fd = new FormData();
    appendResolvedMentions(fd, []);
    fd.append("mentionSignerIds", "");
    expect(readSubmittedMentions(fd).signerIds).toEqual([]);
  });
});

describe("resolveSubmittedMentions", () => {
  it("resolves a submitted id whose name is in the body", () => {
    const body = "thanks @Alice Nguyen";
    expect(resolveSubmittedMentions(body, [ALICE.id], KNOWN)).toEqual([pick(ALICE)]);
  });

  it("drops ids that are not mentionable signers", () => {
    const body = "thanks @Alice Nguyen";
    expect(resolveSubmittedMentions(body, ["sig-nope", ALICE.id], KNOWN)).toEqual([
      pick(ALICE),
    ]);
  });

  it("drops a signer whose name is absent from the body", () => {
    // The spoofing case: a crafted request naming every signer notifies nobody,
    // because a notification requires the name to be visibly in the comment.
    const body = "nothing to see here";
    expect(resolveSubmittedMentions(body, KNOWN.map((s) => s.id), KNOWN)).toEqual([]);
  });

  it("checks the name from the signer record, so a submitted id cannot borrow another name", () => {
    // The request supplies ids only — never text — so the name searched for is
    // always the one on the trusted signer row. Submitting Erik's id against a
    // body that names Alice therefore resolves to nobody: Erik's own name has
    // to be in the body for Erik to be notified.
    expect(resolveSubmittedMentions("thanks @Alice Nguyen", [ERIK.id], KNOWN)).toEqual(
      [],
    );
    expect(resolveSubmittedMentions("thanks @Erik", [ERIK.id], KNOWN)).toEqual([
      pick(ERIK),
    ]);
  });

  it("dedupes repeated ids", () => {
    const body = "@Alice Nguyen";
    expect(resolveSubmittedMentions(body, [ALICE.id, ALICE.id], KNOWN)).toEqual([
      pick(ALICE),
    ]);
  });

  it("returns an empty list for no submitted ids", () => {
    expect(resolveSubmittedMentions("hey @Alice Nguyen", [], KNOWN)).toEqual([]);
  });

  describe("the bug class this replaces is unreachable", () => {
    // Each body below made `parseMentions` email a signer who was never
    // mentioned. With write-time resolution there is no id to submit, so the
    // outcome is nobody — regardless of how the text is punctuated.
    it.each([
      ["bob!@alice.com, then cc me", "trailing comma after an email address"],
      ["(bob?@alice.com)", "email address in parentheses"],
      ["bob&@alice.com;", "email address before a semicolon"],
      ["https://example.com/p?ref=@alice", "@ in a URL query string"],
      ["192.168.1.5/@alice", "@ after a dotted-quad host"],
      ["example.com:8080/@alice", "@ after a host with a port"],
      ["README.md/@Alice", "@ after a dotted filename"],
    ])("notifies nobody for %s (%s)", (body) => {
      expect(resolveSubmittedMentions(body, [], KNOWN)).toEqual([]);
      expect(pruneResolvedMentions(body, [])).toEqual([]);
    });

    it("still notifies nobody when a stray id is submitted alongside", () => {
      // Even a client that submits Alice's id for `bob!@alice.com` fails the
      // containment check: the body has no "@Alice Nguyen".
      expect(resolveSubmittedMentions("bob!@alice.com", [ALICE.id], KNOWN)).toEqual([]);
    });
  });
});
