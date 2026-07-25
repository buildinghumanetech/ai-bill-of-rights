/**
 * Shared shape of a text selection that can be turned into a comment.
 * Emitted by `<ArticleSelectionContainer>` as the `selection-in-anchor` event
 * and consumed by `<CommentsColumn>`.
 */
export interface AnchoredSelection {
  anchorId: string;
  selectedText: string;
}

/**
 * Should a freshly observed selection be emitted?
 *
 * The container watches two signals — `mouseup` (instant on desktop) and a
 * debounced `selectionchange` (the only one that fires for a touch long-press
 * on iOS). Both fire for the same gesture, so without a guard the composer
 * would remount and discard whatever the user had already typed. Emitting only
 * when the anchor or the selected text actually changed makes the second
 * signal a no-op.
 */
export function shouldEmitSelection(
  last: AnchoredSelection | null,
  next: AnchoredSelection,
): boolean {
  if (!next.selectedText.trim()) return false;
  if (!last) return true;
  return last.anchorId !== next.anchorId || last.selectedText !== next.selectedText;
}
