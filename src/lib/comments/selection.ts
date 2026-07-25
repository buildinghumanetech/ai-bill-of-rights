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
  /** Viewport rect of the *composer itself*, not its container. */
  composerRect: { top: number; bottom: number };
  viewportHeight: number;
}

/**
 * Fraction of the composer that must be on screen for it to count as "the user
 * can see it". Expressed as a ratio of the element's own measured height rather
 * than a pixel constant, so it can't drift as the composer's contents change.
 */
const MIN_VISIBLE_FRACTION = 0.5;

/**
 * Should the page pull the comments column into view for this selection?
 *
 * One rule: scroll when the user can't actually see the composer.
 *
 * An earlier version also gated on the selection's anchor, to stop an iOS
 * selection-handle drag (which re-emits repeatedly) from yanking the sentence
 * out from under the finger adjusting it. That turned out to be both redundant
 * and harmful. Redundant because the first scroll centers the composer, so
 * every subsequent emit in the same gesture already sees it as visible and
 * declines. Harmful because anchors are sentence-level: re-selecting a
 * different phrase within the *same* sentence kept matching the gate, so the
 * composer silently updated off-screen and never recovered — the thing the user
 * would have to dismiss to reset it being the thing they couldn't see.
 *
 * Measuring the composer rather than its column matters for the same reason:
 * the column's top edge can sit just inside the viewport while the composer,
 * which starts ~50px lower, is entirely below the fold.
 */
export function shouldScrollComposerIntoView({
  composerRect,
  viewportHeight,
}: ScrollDecisionInput): boolean {
  const height = composerRect.bottom - composerRect.top;
  if (height <= 0) return true;
  const visible =
    Math.min(composerRect.bottom, viewportHeight) - Math.max(composerRect.top, 0);
  return visible / height < MIN_VISIBLE_FRACTION;
}
