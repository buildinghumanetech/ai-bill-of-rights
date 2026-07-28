// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";

/**
 * Seam test for the REPLY composer, the second caller of
 * `appendResolvedMentions`.
 *
 * `new-comment-form.mentions.test.tsx` covers the top-level composer. It did not
 * cover this one, and replies are the likelier place a mention appears: deleting
 * the `appendResolvedMentions(...)` line from `handleReplySubmit` left the whole
 * suite green while every reply mention silently notified nobody. So this asserts
 * on the actual FormData handed to `submitCommentAction`, and pins the draft
 * resets that keep a pick from outliving the reply it was made for.
 */
const submitCommentAction =
  vi.fn<(fd: FormData) => Promise<{ ok: boolean; id?: string }>>(async () => ({
    ok: true,
    id: "r1",
  }));

vi.mock("@/server/actions/comments", () => ({
  submitCommentAction: (fd: FormData) => submitCommentAction(fd),
  editCommentAction: vi.fn(),
  deleteCommentAction: vi.fn(),
}));
vi.mock("@/server/actions/comment-votes", () => ({ voteCommentAction: vi.fn() }));
vi.mock("@/server/actions/comment-reports", () => ({
  toggleReportCommentAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { CommentNode } from "@/components/CommentNode";
import {
  MENTION_IDS_FIELD,
  MENTION_SOURCE_COMPOSER,
  MENTION_SOURCE_FIELD,
} from "@/lib/comments/resolved-mentions";
import type { ThreadedComment } from "@/lib/db/queries";

const SIGNERS = [
  { id: "sig-alice", displayName: "Alice Nguyen" },
  { id: "sig-erik", displayName: "Erik" },
  // A name with trailing whitespace. Ugly, but reachable from real signer data,
  // and it is the only thing that makes the submit-time re-prune observable.
  { id: "sig-padded", displayName: "Padded Name " },
];

const ADMIN_SIGNERS = [
  { id: "sig-me", displayName: "Me" },
  { id: "sig-alice", displayName: "Alice Nguyen" },
];

const COMMENT: ThreadedComment = {
  id: "c-parent",
  body: "the original comment",
  signerId: "sig-other",
  displayName: "Someone Else",
  parentCommentId: null,
  anchorId: "preamble-s-1",
  selectedText: null,
  createdAt: new Date("2026-07-01T00:00:00Z"),
  score: 0,
  myVote: null,
  myReport: false,
  replies: [],
};

function renderNode({ isAdmin = false } = {}) {
  return render(
    <CommentNode
      comment={COMMENT}
      viewerSignerId="sig-me"
      isAdmin={isAdmin}
      signersForAdmin={isAdmin ? ADMIN_SIGNERS : []}
      signersForMention={SIGNERS}
      depth={0}
      baseVersionId="v1"
      rootAnchorId="preamble-s-1"
    />,
  );
}

/**
 * The reply/cancel toggle in the action row.
 *
 * Selected on its `aria-label`, which exists because the visible copy
 * ("reply"/"cancel") differs from the composer's own Reply/Cancel buttons only in
 * letter case. Matching on the visible text would mean a cosmetic re-casing of
 * the action row breaks these tests with an error pointing nowhere near mentions.
 */
function toggle() {
  fireEvent.click(
    screen.getByRole("button", { name: /^(Reply to this comment|Cancel reply)$/ }),
  );
}

function type(text: string) {
  fireEvent.change(screen.getByRole("textbox"), { target: { value: text } });
}

function pick(name: string) {
  fireEvent.mouseDown(screen.getByRole("option", { name }));
}

async function submitReply() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Reply" }));
  });
}

/** The FormData from the most recent submit. */
function submitted(): FormData {
  expect(submitCommentAction).toHaveBeenCalled();
  return submitCommentAction.mock.calls[submitCommentAction.mock.calls.length - 1][0];
}

beforeEach(() => {
  submitCommentAction.mockClear();
});
afterEach(cleanup);

describe("CommentNode reply mention wiring", () => {
  it("submits the picked signer id and the source marker", async () => {
    renderNode();
    toggle();

    type("agreed @Ali");
    pick("@Alice Nguyen");
    await submitReply();

    const fd = submitted();
    expect(fd.get(MENTION_SOURCE_FIELD)).toBe(MENTION_SOURCE_COMPOSER);
    expect(fd.getAll(MENTION_IDS_FIELD)).toEqual(["sig-alice"]);
    expect(fd.get("body")).toBe("agreed @Alice Nguyen");
    // The reply must stay attached to the comment it answers.
    expect(fd.get("parentCommentId")).toBe("c-parent");
  });

  it("submits the marker with no ids when the name was typed by hand", async () => {
    renderNode();
    toggle();

    type("agreed @Alice Nguyen");
    await submitReply();

    const fd = submitted();
    expect(fd.get(MENTION_SOURCE_FIELD)).toBe(MENTION_SOURCE_COMPOSER);
    expect(fd.getAll(MENTION_IDS_FIELD)).toEqual([]);
  });

  it("does not submit an id for a mention deleted before sending", async () => {
    renderNode();
    toggle();

    type("agreed @Ali");
    pick("@Alice Nguyen");
    type("never mind");
    await submitReply();

    expect(submitted().getAll(MENTION_IDS_FIELD)).toEqual([]);
  });

  it("does not carry a pick across a collapse via the action-row toggle", async () => {
    // The toggle unmounts the composer, which loses its picks. If the draft
    // survived, reopening and retyping the same text would notify someone for a
    // reply they were never picked in.
    renderNode();
    toggle();

    type("agreed @Ali");
    pick("@Alice Nguyen");
    toggle();
    // Assert the collapse actually happened. Clicking twice blindly would hide a
    // regression where the toggle stops collapsing — and the unmount is the
    // mechanism that loses the picks, so it is the thing worth pinning.
    expect(screen.queryByRole("textbox")).toBeNull();
    toggle();

    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("");

    type("agreed @Alice Nguyen");
    await submitReply();

    expect(submitted().getAll(MENTION_IDS_FIELD)).toEqual([]);
  });

  it("does not carry a pick across the Cancel button", async () => {
    // Cancel is a separate reset path from the action-row toggle. It used to
    // clear the body but leave the picks, so this pins them together.
    renderNode();
    toggle();

    type("agreed @Ali");
    pick("@Alice Nguyen");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("textbox")).toBeNull();
    toggle();

    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("");

    type("agreed @Alice Nguyen");
    await submitReply();

    expect(submitted().getAll(MENTION_IDS_FIELD)).toEqual([]);
  });

  it("does not carry a pick over to the next reply after a successful send", async () => {
    renderNode();
    toggle();

    type("agreed @Ali");
    pick("@Alice Nguyen");
    await submitReply();
    expect(submitted().getAll(MENTION_IDS_FIELD)).toEqual(["sig-alice"]);

    // Submitting collapses the form, so reopen and paste the old text back in.
    toggle();
    type("agreed @Alice Nguyen");
    await submitReply();

    expect(submitted().getAll(MENTION_IDS_FIELD)).toEqual([]);
  });

  it("re-prunes against the trimmed body, not the composer's", async () => {
    // `handleReplySubmit` submits `body.trim()` but resolves against the picks,
    // so the two can disagree. A display name ending in whitespace is the case
    // that makes it observable: the composer holds "agreed @Padded Name  " and
    // the pick matches on "@Padded Name ", but the *submitted* body is trimmed to
    // "agreed @Padded Name", where that needle is gone.
    //
    // Nobody is notified, which is the module's stated direction of failure —
    // silence, never a wrong recipient. Without the submit-time re-prune this
    // sends sig-padded for a body that no longer contains their mention text.
    renderNode();
    toggle();

    type("agreed @Padded");
    pick("@Padded Name");
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe(
      "agreed @Padded Name  ",
    );

    // KNOWN INCONSISTENCY, asserted so it cannot hide: the composer promises a
    // notification here that the submit will not deliver. `pruneResolvedMentions`
    // sees the untrimmed value, where "@Padded Name " is present, so the
    // "Notifying …" line lists Padded Name — and then nobody is emailed. That
    // line exists precisely so delivery is never a surprise, so this is a real
    // (if narrow) defect, not just cosmetics.
    //
    // The fix is to normalise at the insertion point so composer, submitted body
    // and server all agree on the needle — trimming inside `mentionText` would do
    // it in one place. Deliberately not done here: it changes who gets notified,
    // and that call is not mine to make unilaterally.
    //
    // What pins the defect is the PAIR: notify-list populated, submitted ids
    // empty. Neither assertion says anything on its own — and it is THIS one,
    // the notify-list, that passes either way, because "@Padded Name" is present
    // in the padded composer value too.
    //
    // Two assertions move when the fix is taken, and the first is above, not
    // below: `selectSuggestion` inserts `mentionText(...)`, so trimming there
    // also trims what the composer writes. The value assertion becomes
    // "agreed @Padded Name " (one trailing space, not two) and fails FIRST, then
    // MENTION_IDS_FIELD below flips to ["sig-padded"]. Measured, post-refactor.
    expect(screen.getByTestId("mention-notify-list").textContent).toContain(
      "Padded Name",
    );

    await submitReply();

    const fd = submitted();
    expect(fd.get("body")).toBe("agreed @Padded Name");
    expect(fd.getAll(MENTION_IDS_FIELD)).toEqual([]);
  });

  it("submits the admin post-as signer, and clears it after the send", async () => {
    renderNode({ isAdmin: true });
    toggle();

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "sig-alice" } });
    type("agreed @Ali");
    pick("@Alice Nguyen");
    await submitReply();

    const fd = submitted();
    expect(fd.get("actAsSignerId")).toBe("sig-alice");
    expect(fd.getAll(MENTION_IDS_FIELD)).toEqual(["sig-alice"]);

    // And pin the SUBMIT path's reset of it. The collapse case below cannot: a
    // successful submit already calls `resetReplyDraft()` + `setShowReply(false)`,
    // so the toggle here is a reopen, not a collapse. Without this, nothing
    // catches `handleReplySubmit` narrowing its reset and leaking "post as X"
    // into the admin's next reply.
    toggle();
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("");
  });

  it("drops the admin post-as signer when the reply is collapsed", () => {
    // Unifying the reset paths made the action-row toggle clear
    // `replyActAsSignerId`, which it used to preserve: an admin who picks
    // "post as X", collapses to re-read the thread, and reopens is posting as
    // themselves again.
    //
    // This has to collapse WITHOUT submitting. A successful submit calls
    // `resetReplyDraft()` and `setShowReply(false)` itself, so a `toggle()` after
    // one is an expand, skips the `if (showReply)` branch entirely, and measures
    // the submit path's reset instead — which was never in question.
    renderNode({ isAdmin: true });
    toggle();

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "sig-alice" } });
    toggle();
    expect(screen.queryByRole("combobox")).toBeNull();

    toggle();
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("");
  });
});
