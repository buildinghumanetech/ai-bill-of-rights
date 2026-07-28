// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { act, useState } from "react";
import { MentionTextarea } from "@/components/MentionTextarea";
import { mentionText, type ResolvedMention } from "@/lib/comments/resolved-mentions";

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

/**
 * Run `body` with `requestAnimationFrame` queueing instead of firing.
 *
 * `selectSuggestion` defers its caret write to a frame because React has to
 * commit the new value first. So the frame must land AFTER the commit: running
 * the callback inline sets the caret on the *old* value, and jsdom then resets it
 * to the end when the new value commits — indistinguishable from the caret-losing
 * regression these tests exist to catch. `flush()` runs the queued callbacks at
 * the point the real browser would, and asserts at least one was scheduled.
 */
function withQueuedFrames(body: (flush: () => void) => void): void {
  const frames: FrameRequestCallback[] = [];
  const raf = vi
    .spyOn(window, "requestAnimationFrame")
    .mockImplementation((cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    });
  try {
    body(() => {
      // Assert a frame was scheduled rather than silently flushing nothing: an
      // empty queue would let every caret assertion below pass against whatever
      // jsdom happened to leave the caret at.
      expect(frames.length).toBeGreaterThan(0);
      act(() => {
        frames.splice(0).forEach((cb) => cb(0));
      });
    });
  } finally {
    raf.mockRestore();
  }
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

  it("leaves the caret after the inserted mention", () => {
    // `selectSuggestion` derives the caret from the length of what it actually
    // inserted rather than from `displayName.length + 1`, so that it survives
    // `mentionText` ever normalising the name. Nothing pinned that arithmetic at
    // all, which made the whole point of deriving it unverifiable.
    //
    // What this does and does not catch, measured: replacing the computation with
    // `newValue.length` fails it. It cannot tell `inserted.length` from
    // `displayName.length + 1` for the names used HERE, because they need no
    // trimming and so the two are equal; the padded-name case in
    // `comment-node.mentions.test.tsx` is where that distinction is observable.
    // So this pins the caret landing on the mention rather than at the end of the
    // text, which is the regression a reader would actually notice.
    //
    // The rAF ordering this depends on is explained on `withQueuedFrames`.
    withQueuedFrames((flush) => {
      render(<Harness onResolved={vi.fn()} />);

      // Mid-text, with the caret inside the mention — `detectMentionQuery` reads
      // `selectionStart`, and text after the caret is what makes the caret
      // assertion mean something: it must land on the mention, not on the end of
      // the value.
      fireEvent.change(screen.getByRole("textbox"), {
        target: { value: "hey @Ali and more", selectionStart: 8 },
      });
      fireEvent.mouseDown(screen.getByRole("option", { name: "@Alice Nguyen" }));
      flush();

      const ta = screen.getByRole("textbox") as HTMLTextAreaElement;
      const inserted = mentionText("Alice Nguyen");
      // One space after the mention, not two: `after` already began with one, so
      // `selectSuggestion` adds none. Picking at the end of the text is the other
      // case, covered by the tests above; punctuation by the case below.
      expect(ta.value).toBe("hey @Alice Nguyen and more");
      // Just past the mention and the space that follows it — where the author's
      // next keystroke goes, which is well short of `value.length`.
      expect(ta.selectionStart).toBe(ta.value.indexOf(inserted) + inserted.length + 1);
      expect(ta.selectionStart).toBeLessThan(ta.value.length);
      expect(ta.selectionStart).toBe(ta.selectionEnd);
    });
  });

  it("adds no space when the pick is followed by punctuation", () => {
    // `sep` is gated on a punctuation class, not on a bare leading space, so
    // picking before a comma reads as prose: "@Alice Nguyen, thanks".
    //
    // The caret moves with that gate and is asserted here for that reason. The
    // caret only steps over a space when one actually follows; before punctuation
    // it stays tight against the mention, because the author's next keystroke
    // belongs before the comma and not after it. Assert the value alone and that
    // half regresses silently — which is how this case slipped through the first
    // time it was written down.
    withQueuedFrames((flush) => {
      render(<Harness onResolved={vi.fn()} />);

      fireEvent.change(screen.getByRole("textbox"), {
        target: { value: "hey @Ali, thanks", selectionStart: 8 },
      });
      fireEvent.mouseDown(screen.getByRole("option", { name: "@Alice Nguyen" }));
      flush();

      const ta = screen.getByRole("textbox") as HTMLTextAreaElement;
      const inserted = mentionText("Alice Nguyen");
      expect(ta.value).toBe("hey @Alice Nguyen, thanks");
      // Immediately after the mention — on the comma, not past it.
      expect(ta.selectionStart).toBe(ta.value.indexOf(inserted) + inserted.length);
      expect(ta.value[ta.selectionStart]).toBe(",");
    });
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
