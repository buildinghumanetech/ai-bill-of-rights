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
  // A name with trailing whitespace. NOT reachable from real signer data — every
  // write path trims (`formatDisplayName` in sign-from-modal.ts; `.trim()` in
  // account.ts, admin.ts, non-signers.ts). Fixtured because it is the only input
  // that makes `mentionText`'s own normalisation observable, so the needle stays
  // correct if a future writer forgets to trim.
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
  // This body mentions nobody. Highlighting reads these rows, not the prose.
  mentionedSignerIds: [],
  replies: [],
};

function renderNode({ isAdmin = false, comment = COMMENT } = {}) {
  return render(
    <CommentNode
      comment={comment}
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

  it("normalises a padded display name so the promise matches the delivery", async () => {
    // `handleReplySubmit` submits `body.trim()` while resolving against the
    // picks, so the composer's value and the submitted body can disagree about
    // what the needle is. A display name with trailing whitespace is the case
    // that makes it observable, and it USED to break: the composer held
    // "agreed @Padded Name  " and matched on "@Padded Name ", the submitted body
    // was trimmed to "agreed @Padded Name", the needle was gone, and the author
    // was told they had notified someone who then got nothing.
    //
    // `mentionText` trims now, so all three sides agree on "@Padded Name" and
    // the promise is kept. Note this is a REGRESSION GUARD, not a live fix:
    // every display-name write path already trims (`formatDisplayName` in
    // sign-from-modal.ts; `.trim()` in account.ts, admin.ts, non-signers.ts), so
    // "Padded Name " below cannot reach the database today. It is fixtured here
    // to pin the needle's own behaviour, so a future writer that forgets to trim
    // cannot turn a cosmetic data problem into dropped notifications.
    renderNode();
    toggle();

    type("agreed @Padded");
    pick("@Padded Name");
    // One trailing space, from the composer's typing affordance — not two. The
    // padding is gone at the point of insertion.
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe(
      "agreed @Padded Name ",
    );
    expect(screen.getByTestId("mention-notify-list").textContent).toContain(
      "Padded Name",
    );

    await submitReply();

    // The PAIR is what matters: the notify-list above said this person would be
    // notified, and the submitted ids agree. Before the trim these two
    // contradicted each other, and only asserting both catches that.
    const fd = submitted();
    expect(fd.get("body")).toBe("agreed @Padded Name");
    expect(fd.getAll(MENTION_IDS_FIELD)).toEqual(["sig-padded"]);
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

describe("CommentNode mention highlighting", () => {
  /** The highlight spans in the rendered body, by their text. */
  function highlighted(): string[] {
    return Array.from(document.querySelectorAll("p .bg-blue-50")).map(
      (el) => el.textContent ?? "",
    );
  }

  it("does not style a name the author typed by hand", () => {
    // The decision this whole change implements: a hand-typed name notifies
    // nobody, so it must not LOOK like it notified anybody. Styling it was a
    // promise the delivery path never kept — the reader could not tell a real
    // mention from a string that merely looked like one.
    renderNode({
      comment: { ...COMMENT, body: "thanks @Alice Nguyen", mentionedSignerIds: [] },
    });

    expect(screen.getByText("thanks @Alice Nguyen")).toBeTruthy();
    expect(highlighted()).toEqual([]);
  });

  it("styles a name the author picked from the typeahead", () => {
    // Same body, same signers — only the stored rows differ. That is the entire
    // input to highlighting now, which is what keeps display and delivery honest.
    renderNode({
      comment: {
        ...COMMENT,
        body: "thanks @Alice Nguyen",
        mentionedSignerIds: ["sig-alice"],
      },
    });

    expect(highlighted()).toEqual(["@Alice Nguyen"]);
  });
});
