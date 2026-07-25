// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { MentionTextarea } from "@/components/MentionTextarea";
import type { ResolvedMention } from "@/lib/comments/resolved-mentions";

const SIGNERS = [
  { id: "sig-alice", displayName: "Alice Nguyen" },
  { id: "sig-erik", displayName: "Erik" },
  { id: "sig-erika", displayName: "Erika Anderson" },
];

/**
 * The real composers own `body` state, so drive the component the same way —
 * a controlled wrapper. Without this the value prop never updates and the
 * prune-on-change effect can't be observed.
 */
function Harness({
  onResolved,
  listen = true,
}: {
  onResolved?: (m: ResolvedMention[]) => void;
  listen?: boolean;
}) {
  const [body, setBody] = useState("");
  return (
    <MentionTextarea
      value={body}
      onChange={setBody}
      signers={SIGNERS}
      onResolvedMentionsChange={listen ? onResolved : undefined}
    />
  );
}

/** jest-dom isn't a dependency here, so read the value directly. */
function textareaValue(): string {
  return (screen.getByRole("textbox") as HTMLTextAreaElement).value;
}

function type(text: string) {
  const ta = screen.getByRole("textbox");
  fireEvent.change(ta, { target: { value: text } });
  return ta;
}

/** Last set of mentions the parent was told about. */
function lastCall(spy: ReturnType<typeof vi.fn>): ResolvedMention[] {
  expect(spy).toHaveBeenCalled();
  return spy.mock.calls[spy.mock.calls.length - 1][0];
}

afterEach(cleanup);

describe("MentionTextarea write-time resolution", () => {
  it("reports the signer id when a suggestion is picked", () => {
    const onResolved = vi.fn();
    render(<Harness onResolved={onResolved} />);

    type("hey @Ali");
    fireEvent.mouseDown(screen.getByRole("option", { name: "@Alice Nguyen" }));

    expect(lastCall(onResolved)).toEqual([
      { signerId: "sig-alice", displayName: "Alice Nguyen" },
    ]);
    expect(textareaValue()).toBe("hey @Alice Nguyen ");
  });

  it("reports nothing when the author types the whole name by hand", () => {
    // The core behaviour change: an unpicked name notifies nobody rather than
    // being guessed at. The visible "Notifying" line is what keeps this honest.
    const onResolved = vi.fn();
    render(<Harness onResolved={onResolved} />);

    type("hey @Alice Nguyen thanks");

    expect(lastCall(onResolved)).toEqual([]);
    expect(screen.queryByTestId("mention-notify-list")).toBeNull();
  });

  it("drops the mention when the author deletes it after picking", () => {
    const onResolved = vi.fn();
    render(<Harness onResolved={onResolved} />);

    type("hey @Ali");
    fireEvent.mouseDown(screen.getByRole("option", { name: "@Alice Nguyen" }));
    expect(lastCall(onResolved)).toHaveLength(1);

    type("never mind");
    expect(lastCall(onResolved)).toEqual([]);
  });

  it("does not re-arm when the author deletes a picked mention and retypes it", () => {
    // The pick is forgotten on the edit that removed it, so retyping the same
    // name by hand lands in the unpicked case — nobody notified.
    const onResolved = vi.fn();
    render(<Harness onResolved={onResolved} />);

    type("hey @Ali");
    fireEvent.mouseDown(screen.getByRole("option", { name: "@Alice Nguyen" }));
    expect(lastCall(onResolved)).toHaveLength(1);

    type("hey ");
    expect(lastCall(onResolved)).toEqual([]);

    type("hey @Alice Nguyen");
    expect(lastCall(onResolved)).toEqual([]);
  });

  it("shows who will be notified, and updates as picks change", () => {
    render(<Harness onResolved={vi.fn()} />);

    type("hey @Ali");
    fireEvent.mouseDown(screen.getByRole("option", { name: "@Alice Nguyen" }));
    expect(screen.getByTestId("mention-notify-list").textContent).toContain(
      "@Alice Nguyen",
    );

    type("hey @Alice Nguyen and @Erika");
    fireEvent.mouseDown(screen.getByRole("option", { name: "@Erika Anderson" }));
    const line = screen.getByTestId("mention-notify-list").textContent ?? "";
    expect(line).toContain("@Alice Nguyen");
    expect(line).toContain("@Erika Anderson");
  });

  it("does not promise a notification when no parent is listening", () => {
    // The inline edit composer sends no mail, so it passes no callback and must
    // not render the "Notifying" line.
    render(<Harness listen={false} />);

    type("hey @Ali");
    fireEvent.mouseDown(screen.getByRole("option", { name: "@Alice Nguyen" }));

    expect(textareaValue()).toBe("hey @Alice Nguyen ");
    expect(screen.queryByTestId("mention-notify-list")).toBeNull();
  });

  it("picks the highlighted suggestion on Enter", () => {
    const onResolved = vi.fn();
    render(<Harness onResolved={onResolved} />);

    const ta = type("cc @Erik");
    // Two signers match the "Erik" prefix; arrow down to the second.
    fireEvent.keyDown(ta, { key: "ArrowDown" });
    fireEvent.keyDown(ta, { key: "Enter" });

    expect(lastCall(onResolved)).toEqual([
      { signerId: "sig-erika", displayName: "Erika Anderson" },
    ]);
  });

  it("never reports a signer the author did not pick", () => {
    // "@Erika Anderson" contains "@Erik", the exact shape that made the old
    // prefix matcher email the wrong person. Picking Erika reports only Erika.
    const onResolved = vi.fn();
    render(<Harness onResolved={onResolved} />);

    type("thanks @Erika");
    fireEvent.mouseDown(screen.getByRole("option", { name: "@Erika Anderson" }));

    expect(lastCall(onResolved)).toEqual([
      { signerId: "sig-erika", displayName: "Erika Anderson" },
    ]);
  });

  it("clears its picks when the parent resets the body", () => {
    // After a successful submit the parent sets body back to "". The pruning
    // effect must react to that, or the next comment would re-notify.
    function ResettableHarness({ onResolved }: { onResolved: (m: ResolvedMention[]) => void }) {
      const [body, setBody] = useState("");
      return (
        <>
          <MentionTextarea
            value={body}
            onChange={setBody}
            signers={SIGNERS}
            onResolvedMentionsChange={onResolved}
          />
          <button type="button" onClick={() => setBody("")}>
            reset
          </button>
        </>
      );
    }
    const onResolved = vi.fn();
    render(<ResettableHarness onResolved={onResolved} />);

    type("hey @Ali");
    fireEvent.mouseDown(screen.getByRole("option", { name: "@Alice Nguyen" }));
    expect(lastCall(onResolved)).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "reset" }));
    expect(lastCall(onResolved)).toEqual([]);
  });
});
