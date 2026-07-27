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
 * Selected by testid, not label: it reads "reply"/"cancel" while the composer's
 * own buttons read "Reply"/"Cancel", and `getByRole`'s name matcher is
 * case-sensitive. Matching on case would make a cosmetic re-casing of the action
 * row break these tests with an error that has nothing to do with mentions.
 */
function toggle() {
  fireEvent.click(screen.getByTestId("reply-toggle"));
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

    await submitReply();

    const fd = submitted();
    expect(fd.get("body")).toBe("agreed @Padded Name");
    expect(fd.getAll(MENTION_IDS_FIELD)).toEqual([]);
  });

  it("submits the admin post-as signer, and drops it on collapse", async () => {
    // Unifying the reset paths made the action-row toggle clear
    // `replyActAsSignerId`, which it used to preserve. That is a real behaviour
    // change for admins — collapse to re-read the thread, reopen, and you are
    // posting as yourself again — so it gets pinned deliberately rather than
    // left to be discovered.
    renderNode({ isAdmin: true });
    toggle();

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "sig-alice" } });
    type("agreed @Ali");
    pick("@Alice Nguyen");
    await submitReply();

    const fd = submitted();
    expect(fd.get("actAsSignerId")).toBe("sig-alice");
    expect(fd.getAll(MENTION_IDS_FIELD)).toEqual(["sig-alice"]);

    // Reopen: the post-as selection is back to the default, not the stale pick.
    toggle();
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("");
  });
});
