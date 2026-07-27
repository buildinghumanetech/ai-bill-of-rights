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

function renderNode() {
  return render(
    <CommentNode
      comment={COMMENT}
      viewerSignerId="sig-me"
      isAdmin={false}
      signersForAdmin={[]}
      signersForMention={SIGNERS}
      depth={0}
      baseVersionId="v1"
      rootAnchorId="preamble-s-1"
    />,
  );
}

/** The reply/cancel toggle in the action row. */
function toggle(name: "reply" | "cancel") {
  fireEvent.click(screen.getByRole("button", { name }));
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
    toggle("reply");

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
    toggle("reply");

    type("agreed @Alice Nguyen");
    await submitReply();

    const fd = submitted();
    expect(fd.get(MENTION_SOURCE_FIELD)).toBe(MENTION_SOURCE_COMPOSER);
    expect(fd.getAll(MENTION_IDS_FIELD)).toEqual([]);
  });

  it("does not submit an id for a mention deleted before sending", async () => {
    renderNode();
    toggle("reply");

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
    toggle("reply");

    type("agreed @Ali");
    pick("@Alice Nguyen");
    toggle("cancel");
    toggle("reply");

    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("");

    type("agreed @Alice Nguyen");
    await submitReply();

    expect(submitted().getAll(MENTION_IDS_FIELD)).toEqual([]);
  });

  it("does not carry a pick across the Cancel button", async () => {
    // Cancel is a separate reset path from the action-row toggle. It used to
    // clear the body but leave the picks, so this pins them together.
    renderNode();
    toggle("reply");

    type("agreed @Ali");
    pick("@Alice Nguyen");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    toggle("reply");

    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("");

    type("agreed @Alice Nguyen");
    await submitReply();

    expect(submitted().getAll(MENTION_IDS_FIELD)).toEqual([]);
  });

  it("does not carry a pick over to the next reply after a successful send", async () => {
    renderNode();
    toggle("reply");

    type("agreed @Ali");
    pick("@Alice Nguyen");
    await submitReply();
    expect(submitted().getAll(MENTION_IDS_FIELD)).toEqual(["sig-alice"]);

    // Submitting collapses the form, so reopen and paste the old text back in.
    toggle("reply");
    type("agreed @Alice Nguyen");
    await submitReply();

    expect(submitted().getAll(MENTION_IDS_FIELD)).toEqual([]);
  });
});
