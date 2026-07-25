/**
 * Shared shape of a text selection that can be turned into a comment.
 * Emitted by `<ArticleSelectionContainer>` as the `selection-in-anchor` event
 * and consumed by `<CommentsColumn>`.
 */
export interface AnchoredSelection {
  anchorId: string;
  selectedText: string;
}

export interface SelectionStep {
  /** Dispatch a `selection-in-anchor` event for this observation. */
  emit: boolean;
  /** The `last` value to carry into the next observation. */
  last: AnchoredSelection | null;
}

/**
 * Advance the container's dedupe state by one observation.
 *
 * `observed` is `null` whenever the current selection can't become a comment —
 * collapsed, whitespace-only, or outside any anchored sentence. That case
 * *resets* `last`, which is the whole point of routing every path through here:
 * an early `return` that left a stale `last` behind would make the guard
 * permanently sticky, so re-selecting the same phrase after cancelling the
 * composer would silently do nothing.
 *
 * A repeat of the same anchor+text is suppressed. That is what keeps the two
 * signals feeding the container — `mouseup` and a debounced `selectionchange`,
 * both of which fire for one desktop gesture — from remounting an in-progress
 * composer and discarding what the user had typed.
 */
export function nextSelectionState(
  last: AnchoredSelection | null,
  observed: AnchoredSelection | null,
): SelectionStep {
  if (!observed || !observed.selectedText.trim()) {
    return { emit: false, last: null };
  }
  if (last && last.anchorId === observed.anchorId && last.selectedText === observed.selectedText) {
    return { emit: false, last };
  }
  return { emit: true, last: observed };
}

/**
 * Thin predicate over {@link nextSelectionState}, kept for call sites that only
 * need the yes/no.
 */
export function shouldEmitSelection(
  last: AnchoredSelection | null,
  next: AnchoredSelection,
): boolean {
  return nextSelectionState(last, next).emit;
}
