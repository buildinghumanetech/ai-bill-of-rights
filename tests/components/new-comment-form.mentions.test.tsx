// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";

/**
 * End-to-end wiring test for write-time mentions: composer state ->
 * `appendResolvedMentions` -> form fields -> what the action receives.
 *
 * The unit tests cover each half, but nothing caught the *seam*: deleting the
 * `appendResolvedMentions(...)` call from this form would leave every other test
 * green while silently reverting to notifying nobody. So this asserts on the
 * actual FormData handed to `submitCommentAction`.
 */
const submitCommentAction =
  vi.fn<(fd: FormData) => Promise<{ ok: boolean; id?: string }>>(async () => ({
    ok: true,
    id: "c1",
  }));

vi.mock("@/server/actions/comments", () => ({
  submitCommentAction: (fd: FormData) => submitCommentAction(fd),
}));
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isSignedIn: true }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/lib/comments/draft", () => ({
  saveDraft: vi.fn(),
  clearDraft: vi.fn(),
}));

import { NewCommentForm } from "@/components/NewCommentForm";
import {
  MENTION_IDS_FIELD,
  MENTION_SOURCE_COMPOSER,
  MENTION_SOURCE_FIELD,
} from "@/lib/comments/resolved-mentions";

const SIGNERS = [
  { id: "sig-alice", displayName: "Alice Nguyen" },
  { id: "sig-erik", displayName: "Erik" },
];

function renderForm() {
  return render(
    <NewCommentForm
      baseVersionId="v1"
      anchorId="preamble-s-1"
      selectedText="some quoted text"
      viewerSignerId="sig-me"
      isAdmin={false}
      signersForAdmin={[]}
      signersForMention={SIGNERS}
      onCancel={vi.fn()}
    />,
  );
}

function type(text: string) {
  fireEvent.change(screen.getByRole("textbox"), { target: { value: text } });
}

async function submit() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Comment" }));
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

describe("NewCommentForm mention wiring", () => {
  it("submits the picked signer id and the source marker", async () => {
    renderForm();

    type("thanks @Ali");
    fireEvent.mouseDown(screen.getByRole("option", { name: "@Alice Nguyen" }));
    await submit();

    const fd = submitted();
    expect(fd.get(MENTION_SOURCE_FIELD)).toBe(MENTION_SOURCE_COMPOSER);
    expect(fd.getAll(MENTION_IDS_FIELD)).toEqual(["sig-alice"]);
    expect(fd.get("body")).toBe("thanks @Alice Nguyen");
  });

  it("submits the marker with no ids when the name was typed by hand", async () => {
    // The marker must still be present, or the server can't tell this from a
    // client that does no resolution at all.
    renderForm();

    type("thanks @Alice Nguyen");
    await submit();

    const fd = submitted();
    expect(fd.get(MENTION_SOURCE_FIELD)).toBe(MENTION_SOURCE_COMPOSER);
    expect(fd.getAll(MENTION_IDS_FIELD)).toEqual([]);
  });

  it("does not submit an id for a mention the author deleted before sending", async () => {
    renderForm();

    type("thanks @Ali");
    fireEvent.mouseDown(screen.getByRole("option", { name: "@Alice Nguyen" }));
    type("never mind");
    await submit();

    expect(submitted().getAll(MENTION_IDS_FIELD)).toEqual([]);
  });

  it("submits both ids when two signers are picked", async () => {
    renderForm();

    type("cc @Ali");
    fireEvent.mouseDown(screen.getByRole("option", { name: "@Alice Nguyen" }));
    type("cc @Alice Nguyen and @Eri");
    fireEvent.mouseDown(screen.getByRole("option", { name: "@Erik" }));
    await submit();

    expect(submitted().getAll(MENTION_IDS_FIELD)).toEqual(["sig-alice", "sig-erik"]);
  });

  it("does not carry a mention over to the next comment", async () => {
    // The form clears `body` after a successful submit while staying mounted. If
    // the picks survived that, retyping the old text would re-notify.
    renderForm();

    type("thanks @Ali");
    fireEvent.mouseDown(screen.getByRole("option", { name: "@Alice Nguyen" }));
    await submit();
    expect(submitted().getAll(MENTION_IDS_FIELD)).toEqual(["sig-alice"]);

    // A single change event pasting the previous comment back in — no
    // intermediate edit to prune the stale pick.
    type("thanks @Alice Nguyen");
    await submit();
    expect(submitted().getAll(MENTION_IDS_FIELD)).toEqual([]);
  });
});
