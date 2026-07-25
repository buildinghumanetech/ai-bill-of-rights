import { describe, expect, it } from "vitest";
import { shouldEmitSelection } from "@/lib/comments/selection";

const sel = (anchorId: string, selectedText: string) => ({ anchorId, selectedText });

describe("shouldEmitSelection", () => {
  it("emits the first selection", () => {
    expect(shouldEmitSelection(null, sel("a-1", "belongs to you"))).toBe(true);
  });

  it("does not emit an empty or whitespace-only selection", () => {
    expect(shouldEmitSelection(null, sel("a-1", ""))).toBe(false);
    expect(shouldEmitSelection(null, sel("a-1", "   \n "))).toBe(false);
  });

  it("suppresses the duplicate that the second signal produces", () => {
    // mouseup fires, then the debounced selectionchange fires for the same
    // gesture — the composer must not be remounted.
    const first = sel("a-1", "belongs to you");
    expect(shouldEmitSelection(first, sel("a-1", "belongs to you"))).toBe(false);
  });

  it("emits when the selected text changes within the same anchor", () => {
    const first = sel("a-1", "belongs to you");
    expect(shouldEmitSelection(first, sel("a-1", "belongs to you."))).toBe(true);
  });

  it("emits when the same text is selected in a different anchor", () => {
    const first = sel("a-1", "consent");
    expect(shouldEmitSelection(first, sel("a-2", "consent"))).toBe(true);
  });

  it("re-emits identical text after the selection was cleared", () => {
    // The container resets its `last` to null on a collapsed selection, so
    // re-selecting the same phrase opens the composer again.
    const cleared = null;
    expect(shouldEmitSelection(cleared, sel("a-1", "consent"))).toBe(true);
  });
});
