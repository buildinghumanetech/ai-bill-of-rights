/**
 * Shared vocabulary for turning a text selection into a comment. The two event
 * names live here rather than in either component because they are a contract
 * *between* them, not part of one's API.
 */

/** Dispatched by `<ArticleSelectionContainer>` when a commentable selection settles. */
export const SELECTION_EVENT = "selection-in-anchor";

/** Dispatched by `<CommentsColumn>` whenever the composer is dismissed. */
export const COMPOSER_CLOSED_EVENT = "selection-composer-closed";

export interface AnchoredSelection {
  anchorId: string;
  selectedText: string;
}

export interface SelectionStep {
  /** Dispatch a selection event for this observation. */
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
 * permanently sticky, so re-selecting the same phrase after dismissing the
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

export interface ScrollDecisionInput {
  /** Anchor the composer was last scrolled to, or null if it hasn't been. */
  lastScrolledAnchorId: string | null;
  /** Anchor of the selection that just arrived. */
  anchorId: string;
  /** Viewport rect of the comments column. */
  rect: { top: number; bottom: number };
  viewportHeight: number;
}

/**
 * Should the page pull the comments column into view for this selection?
 *
 * Two independent conditions, and both matter:
 *
 * - **Same anchor as last time → no.** Dragging an iOS selection handle
 *   re-emits with different text but the *same* anchor, and scrolling on each
 *   of those yanks the sentence out from under the finger still adjusting it.
 *   Keying on the anchor rather than on "is the composer already open" means a
 *   genuinely new sentence still scrolls — a user who scrolls back up to the
 *   article and highlights something else must not be left with the composer
 *   silently updating hundreds of pixels off-screen.
 * - **Already visible → no.** Asking whether the column is actually outside the
 *   viewport is the real question, and it holds at any width, so there is no
 *   breakpoint to drift out of sync with the grid.
 */
export function shouldScrollComposerIntoView({
  lastScrolledAnchorId,
  anchorId,
  rect,
  viewportHeight,
}: ScrollDecisionInput): boolean {
  if (lastScrolledAnchorId === anchorId) return false;
  const offScreen = rect.top >= viewportHeight || rect.bottom <= 0;
  return offScreen;
}
